import { v4 as uuidv4 } from "uuid";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createGraph } from "../graph/index.js";
import { updateThreadStatus } from "./threads.js";
import { ThreadRepository } from "../repositories/threadRepository.js";

export type RunStatus =
  | "pending"
  | "running"
  | "error"
  | "success"
  | "timeout"
  | "interrupted";

export interface RunMetadata {
  source?: "input" | "loop" | "update" | string;
  step?: number;
  writes?: Record<string, unknown> | null;
  parents?: Record<string, string>;
  assistant_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

export interface RunConfig {
  tags?: string[];
  recursion_limit?: number;
  configurable?: {
    thread_id?: string | null;
    checkpoint_id?: string | null;
    [key: string]: unknown;
  };
}

export interface InputMessage {
  type: "human" | "ai" | "system" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface Run {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  status: RunStatus;
  metadata?: RunMetadata;
  multitask_strategy?: string;
}

export interface CreateRunRequest {
  assistant_id: string;
  input?: {
    messages?: InputMessage[];
    [key: string]: unknown;
  } | null;
  metadata?: RunMetadata;
  config?: RunConfig;
  streamMode?: Array<
    "values" | "messages" | "events" | "updates" | "debug" | "custom"
  >;
  interruptBefore?: string[];
  interruptAfter?: string[];
  command?: {
    resume?: unknown;
    update?: Record<string, unknown> | [string, unknown][] | null;
    goto?: string | string[];
  };
}

const runStore = new Map<
  string,
  {
    run_id: string;
    thread_id: string;
    assistant_id: string;
    created_at: string;
    updated_at: string;
    status: RunStatus;
    metadata?: RunMetadata;
    multitask_strategy?: string;
    abortController?: AbortController;
  }
>();

const getTimestamp = (): string => new Date().toISOString();

const generateRunId = (): string => `run-${uuidv4()}`;

const convertInputMessages = (messages: InputMessage[]): BaseMessage[] => {
  return messages.map((msg) => {
    switch (msg.type) {
      case "human":
        return new HumanMessage(msg.content);
      case "ai":
        return new AIMessage(msg.content);
      case "system":
        return new SystemMessage(msg.content);
      case "tool":
        return new ToolMessage({
          content: msg.content,
          tool_call_id: msg.tool_call_id || "",
        });
      default:
        return new HumanMessage(msg.content);
    }
  });
};

export const createRun = async (
  threadId: string,
  request: CreateRunRequest,
  checkpointer: BaseCheckpointSaver,
  llm?: BaseChatModel,
  threadRepo?: ThreadRepository,
): Promise<Run> => {
  const runId = generateRunId();
  const timestamp = getTimestamp();

  if (!request.assistant_id) {
    throw new Error("assistant_id is required");
  }

  const runData = {
    run_id: runId,
    thread_id: threadId,
    assistant_id: request.assistant_id,
    created_at: timestamp,
    updated_at: timestamp,
    status: "pending" as RunStatus,
    metadata: request.metadata || {},
    multitask_strategy: "reject",
    abortController: new AbortController(),
  };

  runStore.set(runId, runData);
  updateThreadStatus(threadId, "busy", threadRepo);

  executeRun(threadId, runId, request, checkpointer, llm, threadRepo).catch(
    (error) => {
      console.error(`Run ${runId} execution failed:`, error);
      const run = runStore.get(runId);
      if (run) {
        run.status = "error";
        run.updated_at = getTimestamp();
      }
      updateThreadStatus(threadId, "error", threadRepo);
    },
  );

  return {
    run_id: runId,
    thread_id: threadId,
    assistant_id: request.assistant_id,
    created_at: timestamp,
    updated_at: timestamp,
    status: "running",
    metadata: request.metadata,
    multitask_strategy: "reject",
  };
};

const executeRun = async (
  threadId: string,
  runId: string,
  request: CreateRunRequest,
  checkpointer: BaseCheckpointSaver,
  llm?: BaseChatModel,
  threadRepo?: ThreadRepository,
): Promise<void> => {
  const run = runStore.get(runId);
  if (!run) return;

  run.status = "running";
  run.updated_at = getTimestamp();

  try {
    const graph = createGraph(checkpointer, llm);

    const config = {
      configurable: {
        thread_id: threadId,
        ...request.config?.configurable,
      },
      ...request.config,
    };

    if (request.interruptBefore) {
      (config as Record<string, unknown>).interruptBefore =
        request.interruptBefore;
    }
    if (request.interruptAfter) {
      (config as Record<string, unknown>).interruptAfter =
        request.interruptAfter;
    }

    let input: Record<string, unknown> = {};

    if (request.input?.messages && request.input.messages.length > 0) {
      const messages = convertInputMessages(request.input.messages);
      input = { messages };
    }

    if (request.command?.resume) {
      const { Command } = await import("@langchain/langgraph");
      const command = new Command({ resume: request.command.resume });
      const stream = await graph.streamEvents(
        command as unknown as Record<string, unknown>,
        {
          version: "v2",
          ...config,
        },
      );
      let wasInterrupted = false;
      for await (const event of stream) {
        if (run.abortController?.signal.aborted) {
          run.status = "timeout";
          run.updated_at = getTimestamp();
          updateThreadStatus(threadId, "idle", threadRepo);
          return;
        }
        if (event.event === "__interrupt__") {
          wasInterrupted = true;
          run.status = "interrupted";
          run.updated_at = getTimestamp();
          updateThreadStatus(threadId, "interrupted", threadRepo);
          return;
        }
      }
      if (!wasInterrupted) {
        run.status = "success";
        run.updated_at = getTimestamp();
        updateThreadStatus(threadId, "idle", threadRepo);
      }
      return;
    }

    const stream = await graph.streamEvents(input, {
      version: "v2",
      ...config,
    });

    let wasInterrupted = false;

    for await (const event of stream) {
      if (run.abortController?.signal.aborted) {
        run.status = "timeout";
        run.updated_at = getTimestamp();
        updateThreadStatus(threadId, "idle", threadRepo);
        return;
      }

      if (event.event === "__interrupt__") {
        wasInterrupted = true;
        run.status = "interrupted";
        run.updated_at = getTimestamp();
        updateThreadStatus(threadId, "interrupted", threadRepo);
        return;
      }
    }

    if (!wasInterrupted) {
      run.status = "success";
      run.updated_at = getTimestamp();
      updateThreadStatus(threadId, "idle", threadRepo);
    }
  } catch (error) {
    console.error(`Error executing run ${runId}:`, error);
    run.status = "error";
    run.updated_at = getTimestamp();
    updateThreadStatus(threadId, "error", threadRepo);
    throw error;
  }
};

export const getRun = async (
  threadId: string,
  runId: string,
): Promise<Run | null> => {
  const run = runStore.get(runId);

  if (!run || run.thread_id !== threadId) {
    return null;
  }

  return {
    run_id: run.run_id,
    thread_id: run.thread_id,
    assistant_id: run.assistant_id,
    created_at: run.created_at,
    updated_at: run.updated_at,
    status: run.status,
    metadata: run.metadata,
    multitask_strategy: run.multitask_strategy,
  };
};

export const cancelRun = async (
  threadId: string,
  runId: string,
): Promise<boolean> => {
  const run = runStore.get(runId);

  if (!run || run.thread_id !== threadId) {
    return false;
  }

  if (run.status !== "pending" && run.status !== "running") {
    return false;
  }

  if (run.abortController) {
    run.abortController.abort();
  }

  run.status = "timeout";
  run.updated_at = getTimestamp();
  updateThreadStatus(threadId, "idle");

  return true;
};

export const clearRunStore = (): void => {
  runStore.clear();
};
