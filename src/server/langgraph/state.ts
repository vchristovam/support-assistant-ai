import type { RunnableConfig } from "@langchain/core/runnables";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { IThreadRepository, Thread } from "../../repositories/index.js";
import { parseInterruptsFromValues, toSerializable } from "./serialization.js";
import type { InterruptBody } from "./types.js";

export const parseCheckpointValues = (tuple: unknown): Record<string, unknown> => {
  if (!tuple || typeof tuple !== "object") {
    return {};
  }
  const checkpoint = (tuple as Record<string, unknown>).checkpoint as
    | Record<string, unknown>
    | undefined;
  const channelValues = checkpoint?.channel_values;
  if (!channelValues || typeof channelValues !== "object") {
    return {};
  }
  return toSerializable(channelValues) as Record<string, unknown>;
};

export const createThreadResponse = (
  thread: Thread,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    thread_id: thread.thread_id,
    created_at: thread.created_at.toISOString(),
    updated_at: thread.updated_at.toISOString(),
    state_updated_at: thread.updated_at.toISOString(),
    metadata: thread.metadata,
    status: thread.status,
    values,
    interrupts: parseInterruptsFromValues(values),
  };
};

export const buildRunnableConfig = (
  threadId: string,
  config?: Record<string, unknown>,
): RunnableConfig => {
  const incomingConfig = config ?? {};
  const incomingConfigurable =
    typeof incomingConfig.configurable === "object" &&
    incomingConfig.configurable !== null
      ? (incomingConfig.configurable as Record<string, unknown>)
      : {};

  return {
    ...(incomingConfig as RunnableConfig),
    configurable: {
      ...incomingConfigurable,
      thread_id: threadId,
    },
  };
};

export const parseInterruptCommand = (
  body: InterruptBody,
): { command?: Record<string, unknown>; error?: string } => {
  if (body.command && typeof body.command === "object") {
    return { command: body.command };
  }

  if (Object.prototype.hasOwnProperty.call(body, "resume")) {
    return {
      command: { resume: body.resume },
    };
  }

  if (!body.decision) {
    return {
      error: "Provide one of: command, resume, or decision",
    };
  }

  const decision = body.decision;
  if (decision === "reject") {
    return { command: { resume: { action: "reject" } } };
  }
  if (decision === "edit") {
    return {
      command: {
        resume: {
          action: "edit",
          value: body.edited_action ?? body.value,
        },
      },
    };
  }

  return { command: { resume: { action: "accept" } } };
};

export const updateThreadStatusSafe = async (
  threadRepository: IThreadRepository,
  threadId: string,
  status: Thread["status"],
): Promise<void> => {
  try {
    await threadRepository.updateThreadStatus(threadId, status);
  } catch {
    // Ignore non-critical status update failures to avoid breaking run completion.
  }
};

export const loadThreadValues = async (
  checkpointer: BaseCheckpointSaver,
  threadId: string,
): Promise<Record<string, unknown>> => {
  try {
    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: threadId },
    } as RunnableConfig);
    return parseCheckpointValues(tuple);
  } catch {
    return {};
  }
};

export const buildStateResponseFromTuple = (
  threadId: string,
  tuple: unknown,
): Record<string, unknown> => {
  const values = parseCheckpointValues(tuple);
  const tupleConfig =
    tuple && typeof tuple === "object"
      ? ((tuple as Record<string, unknown>).config as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const metadata =
    tuple && typeof tuple === "object"
      ? ((tuple as Record<string, unknown>).metadata as
          | Record<string, unknown>
          | undefined)
      : undefined;

  return {
    values,
    next: [],
    tasks: [],
    metadata: metadata ?? {},
    created_at: null,
    parent_checkpoint: null,
    config: tupleConfig ?? { configurable: { thread_id: threadId } },
    checkpoint: {
      thread_id: threadId,
      checkpoint_id:
        typeof tupleConfig?.configurable === "object"
          ? (tupleConfig.configurable as Record<string, unknown>).checkpoint_id
          : undefined,
      checkpoint_ns:
        typeof tupleConfig?.configurable === "object"
          ? (tupleConfig.configurable as Record<string, unknown>).checkpoint_ns
          : undefined,
    },
  };
};

export const loadThreadHistory = async (
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  limit: number,
): Promise<Record<string, unknown>[]> => {
  const states: Record<string, unknown>[] = [];
  const iterator = checkpointer.list(
    {
      configurable: { thread_id: threadId },
    } as RunnableConfig,
    { limit },
  );

  for await (const tuple of iterator) {
    states.push(buildStateResponseFromTuple(threadId, tuple));
  }
  return states;
};

export const isInterruptedResult = (result: unknown): boolean => {
  if (!result || typeof result !== "object") {
    return false;
  }
  const rawInterrupt = (result as Record<string, unknown>).__interrupt__;
  return Array.isArray(rawInterrupt) && rawInterrupt.length > 0;
};
