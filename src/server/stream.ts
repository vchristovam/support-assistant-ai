import { createGraph } from "../graph/index.js";
import { Command } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

// Command is used for resume functionality
void Command;

/**
 * Streams graph events as Server-Sent Events.
 * @param input - User message
 * @param threadId - Conversation thread ID
 * @param checkpointer - State persistence backend (Redis or MemorySaver)
 * @param llm - Optional LLM override for testing
 * @returns AsyncIterable of SSE-formatted strings
 */
export async function* streamChatEvents(
  input: string,
  threadId: string,
  checkpointer: BaseCheckpointSaver,
  llm?: BaseChatModel,
) {
  const graph = createGraph(checkpointer, llm);

  const stream = await graph.streamEvents(
    { messages: [new HumanMessage(input)] },
    {
      version: "v2",
      configurable: { thread_id: threadId },
    },
  );

  for await (const event of stream) {
    if (event.event === "__interrupt__") {
      yield `event: interrupt\ndata: ${JSON.stringify(event.data)}\n\n`;
      return;
    }
    yield `data: ${JSON.stringify(event)}\n\n`;
  }

  yield `data: [DONE]\n\n`;
}

/**
 * Resumes graph execution after HITL interrupt.
 * @param threadId - Conversation thread ID
 * @param decision - User decision (approve/reject/edit)
 * @param editedAction - Optional edited action for "edit" decision
 * @param checkpointer - State persistence backend (Redis or MemorySaver)
 * @param llm - Optional LLM override for testing
 * @returns AsyncIterable of SSE-formatted strings
 */
export async function* streamResumeEvents(
  threadId: string,
  decision: string,
  editedAction: object | undefined,
  checkpointer: BaseCheckpointSaver,
  llm?: BaseChatModel,
) {
  const graph = createGraph(checkpointer, llm);

  const command = new Command({
    resume: { decision, editedAction },
  });

  try {
    const stream = await graph.stream(command, {
      configurable: { thread_id: threadId },
    });

    for await (const event of stream) {
      yield `data: ${JSON.stringify(event)}\n\n`;
    }

    yield `data: [DONE]\n\n`;
  } catch (error) {
    console.error("Error in streamResumeEvents:", error);
    yield `data: ${JSON.stringify({ error: "Resume failed", message: String(error) })}\n\n`;
    yield `data: [DONE]\n\n`;
  }
}

export type SSEEventType =
  | "metadata"
  | "values"
  | "messages"
  | "events"
  | "error"
  | "end"
  | "interrupt";

export const formatSSEEvent = (
  eventType: SSEEventType,
  data: unknown,
): string => {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
};

const convertMessagesToSerializable = (
  messages: unknown[],
): Array<Record<string, unknown>> => {
  return messages.map((msg) => {
    if (typeof msg === "object" && msg !== null) {
      const message = msg as Record<string, unknown>;
      if (message.type && typeof message.type === "string") {
        return {
          type: message.type,
          content: message.content,
          id: message.id,
          ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
          ...(message.tool_call_id
            ? { tool_call_id: message.tool_call_id }
            : {}),
          ...(message.name ? { name: message.name } : {}),
        };
      }
      if (message.lc) {
        return message;
      }
    }
    return { type: "unknown", content: String(msg) };
  });
};

export async function* streamRunEvents(
  threadId: string,
  runId: string,
  input: { messages?: unknown[] } | null,
  checkpointer: BaseCheckpointSaver,
  options: {
    streamMode?: Array<"values" | "messages" | "events" | "updates" | "debug">;
    lastEventId?: string;
    command?: {
      resume?: unknown;
    };
  } = {},
  llm?: BaseChatModel,
) {
  const streamMode = options.streamMode || ["values", "messages"];
  const graph = createGraph(checkpointer, llm);

  yield formatSSEEvent("metadata", {
    run_id: runId,
    thread_id: threadId,
  });

  try {
    let streamInput: Record<string, unknown> = {};

    if (options.command?.resume) {
      const { Command } = await import("@langchain/langgraph");
      streamInput = new Command({
        resume: options.command.resume,
      }) as unknown as Record<string, unknown>;
    } else if (input?.messages && input.messages.length > 0) {
      const messages = input.messages.map((msg) => {
        if (typeof msg === "object" && msg !== null) {
          const msgObj = msg as Record<string, unknown>;
          if (msgObj.type === "human" || msgObj.type === "user") {
            return new HumanMessage(String(msgObj.content));
          }
        }
        return new HumanMessage(String(msg));
      });
      streamInput = { messages };
    }

    const config = {
      version: "v2" as const,
      configurable: {
        thread_id: threadId,
      },
    };

    const stream = await graph.streamEvents(streamInput, config);

    let eventCounter = 0;
    const lastEventId = options.lastEventId
      ? parseInt(options.lastEventId, 10)
      : 0;

    for await (const event of stream) {
      eventCounter++;

      if (eventCounter <= lastEventId) {
        continue;
      }

      if (event.event === "__interrupt__") {
        const interruptData = event.data as Record<string, unknown>;
        yield formatSSEEvent("interrupt", interruptData);
        return;
      }

      if (streamMode.includes("events")) {
        yield formatSSEEvent("events", {
          event: event.event,
          name: event.name,
          run_id: event.run_id,
          tags: event.tags,
          metadata: event.metadata,
          data: event.data,
        });
      }

      if (streamMode.includes("values") && event.event === "on_chain_end") {
        const output = event.data?.output as Record<string, unknown>;
        if (output && typeof output === "object") {
          const values: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(output)) {
            if (key === "messages" && Array.isArray(value)) {
              values[key] = convertMessagesToSerializable(value);
            } else {
              values[key] = value;
            }
          }
          if (Object.keys(values).length > 0) {
            yield formatSSEEvent("values", values);
          }
        }
      }

      if (
        streamMode.includes("messages") &&
        event.event === "on_chat_model_stream"
      ) {
        const chunk = event.data?.chunk as Record<string, unknown>;
        if (chunk?.content) {
          const messageChunk = {
            type: "ai",
            content: chunk.content,
          };
          yield formatSSEEvent("messages", [messageChunk]);
        }
      }

      if (
        streamMode.includes("messages") &&
        event.event === "on_chat_model_end"
      ) {
        const output = event.data?.output as Record<string, unknown>;
        if (output?.content) {
          const message = {
            type: "ai",
            content: output.content,
            ...(output.tool_calls ? { tool_calls: output.tool_calls } : {}),
          };
          yield formatSSEEvent("messages", [message]);
        }
      }
    }

    yield formatSSEEvent("end", {});
  } catch (error) {
    console.error("Error in streamRunEvents:", error);
    yield formatSSEEvent("error", {
      error: error instanceof Error ? error.name : "RuntimeError",
      message: error instanceof Error ? error.message : String(error),
    });
    yield formatSSEEvent("end", {});
  }
}
