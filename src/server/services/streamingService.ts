import { createGraph } from "../../graph/index.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/**
 * SSE event types for conversation streaming.
 */
export type SSEEventType =
  | "values"
  | "messages"
  | "events"
  | "error"
  | "end"
  | "interrupt";

/**
 * Formats data as an SSE event string.
 * @param eventType - Type of the event
 * @param data - Data to serialize as JSON
 * @returns SSE-formatted string
 */
export const formatSSEEvent = (
  eventType: SSEEventType,
  data: unknown,
): string => {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
};

/**
 * Converts messages to serializable format for SSE.
 * @param messages - Array of messages to convert
 * @returns Array of serialized message objects
 */
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

/**
 * Streams conversation events as Server-Sent Events.
 * Handles inline HITL interrupts without requiring separate resume functions.
 *
 * @param conversationId - Unique conversation thread identifier
 * @param message - User message to process
 * @param checkpointer - State persistence backend (Redis or MemorySaver)
 * @param llm - Optional LLM override for testing
 * @returns AsyncIterable of SSE-formatted strings
 */
export async function* streamConversationEvents(
  conversationId: string,
  message: string,
  checkpointer: BaseCheckpointSaver,
  llm?: BaseChatModel,
) {
  const graph = createGraph(checkpointer, llm);

  const config = {
    version: "v2" as const,
    configurable: {
      thread_id: conversationId,
    },
  };

  try {
    const stream = await graph.streamEvents(
      { messages: [new HumanMessage(message)] },
      config,
    );

    for await (const event of stream) {
      // Handle HITL interrupt events
      if (event.event === "__interrupt__") {
        const interruptData = event.data as Record<string, unknown>;

        // Transform interrupt data to approval format
        const approvalData = {
          type: "approval",
          description: interruptData.description ?? "Action requires approval",
          actions: interruptData.actions ?? [
            { id: "approve", label: "Approve", type: "approve" },
            { id: "reject", label: "Reject", type: "reject" },
          ],
          ...interruptData,
        };

        yield formatSSEEvent("interrupt", approvalData);
        return;
      }

      // Stream values events (on_chain_end with output)
      if (event.event === "on_chain_end") {
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

      // Stream message chunks (on_chat_model_stream)
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk as Record<string, unknown>;
        if (chunk?.content) {
          const messageChunk = {
            type: "ai",
            content: chunk.content,
          };
          yield formatSSEEvent("messages", [messageChunk]);
        }
      }

      // Stream complete messages (on_chat_model_end)
      if (event.event === "on_chat_model_end") {
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

      // Stream other events for debugging/monitoring
      if (event.event === "on_tool_start" || event.event === "on_tool_end") {
        yield formatSSEEvent("events", {
          event: event.event,
          name: event.name,
          tags: event.tags,
          metadata: event.metadata,
          data: event.data,
        });
      }
    }

    yield formatSSEEvent("end", {});
  } catch (error) {
    yield formatSSEEvent("error", {
      error: error instanceof Error ? error.name : "RuntimeError",
      message: error instanceof Error ? error.message : String(error),
    });
    yield formatSSEEvent("end", {});
  }
}
