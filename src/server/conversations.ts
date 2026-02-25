import type { FastifyInstance } from "fastify";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ThreadRepository } from "../repositories/threadRepository.js";
import type { ConversationRepository } from "../repositories/conversationRepository.js";
import {
  createConversation,
  getConversation,
  getMessages,
} from "./services/conversationService.js";
import { streamConversationEvents } from "./services/streamingService.js";

export interface ConversationServices {
  threadRepository: ThreadRepository;
  conversationRepository: ConversationRepository;
  checkpointer: BaseCheckpointSaver;
  llm?: BaseChatModel;
}

const getUserId = (request: unknown): string => {
  const user = (request as Record<string, unknown>).user as
    | { user_id: string }
    | undefined;
  return user?.user_id ?? "anonymous";
};

export const registerConversationRoutes = (
  app: FastifyInstance,
  services: ConversationServices,
): void => {
  const { threadRepository, conversationRepository, checkpointer, llm } =
    services;

  // POST /conversations - Create a new conversation
  app.post(
    "/conversations",
    {
      schema: {
        description: "Create a new conversation",
        body: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Optional conversation title",
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const body = request.body as { title?: string } | undefined;

        const conversation = await createConversation(
          { title: body?.title },
          threadRepository,
          userId,
        );

        return reply.status(201).send({
          id: conversation.conversation_id,
          title: conversation.title,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
        });
      } catch (error) {
        console.error("Error creating conversation:", error);
        return reply.status(400).send({
          error: "BadRequest",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create conversation",
        });
      }
    },
  );

  // GET /conversations/:id - Get conversation info
  app.get(
    "/conversations/:id",
    {
      schema: {
        description: "Get conversation information",
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Conversation ID" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };

        const conversation = await getConversation(
          id,
          threadRepository,
          userId,
        );

        if (!conversation) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Conversation not found",
          });
        }

        return reply.send({
          id: conversation.conversation_id,
          title: conversation.title,
          created_at: conversation.created_at,
          updated_at: conversation.updated_at,
        });
      } catch (error) {
        console.error("Error getting conversation:", error);
        return reply.status(500).send({
          error: "InternalError",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get conversation",
        });
      }
    },
  );

  // GET /conversations/:id/messages - Get message history
  app.get(
    "/conversations/:id/messages",
    {
      schema: {
        description: "Get conversation message history",
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Conversation ID" },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };

        const messages = await getMessages(
          id,
          conversationRepository,
          userId,
          threadRepository,
        );

        if (messages === null) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Conversation not found",
          });
        }

        return reply.send({
          messages: messages.map((msg) => ({
            id: msg.message_id,
            role: msg.role,
            content: msg.content,
            created_at: msg.created_at,
          })),
        });
      } catch (error) {
        console.error("Error getting messages:", error);
        return reply.status(500).send({
          error: "InternalError",
          message:
            error instanceof Error ? error.message : "Failed to get messages",
        });
      }
    },
  );

  // POST /conversations/:id/messages - Send a message with SSE streaming
  app.post(
    "/conversations/:id/messages",
    {
      schema: {
        description: "Send a message and receive streaming response",
        params: {
          type: "object",
          properties: {
            id: { type: "string", description: "Conversation ID" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            content: { type: "string", description: "Message content" },
          },
          required: ["content"],
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { id } = request.params as { id: string };
        const body = request.body as { content?: string };

        if (!body?.content || typeof body.content !== "string") {
          return reply.status(400).send({
            error: "BadRequest",
            message: "Message content is required",
          });
        }

        const conversation = await getConversation(
          id,
          threadRepository,
          userId,
        );

        if (!conversation) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Conversation not found",
          });
        }

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        try {
          for await (const event of streamConversationEvents(
            id,
            body.content,
            checkpointer,
            llm,
          )) {
            reply.raw.write(event);
          }
          reply.raw.end();
        } catch (streamError) {
          console.error("Error streaming conversation:", streamError);
          const errorEvent =
            "event: error\ndata: " +
            JSON.stringify({
              error: "StreamError",
              message:
                streamError instanceof Error
                  ? streamError.message
                  : "Streaming failed",
            }) +
            "\n\n";
          reply.raw.write(errorEvent);
          reply.raw.write("event: end\ndata: {}\n\n");
          reply.raw.end();
        }
      } catch (error) {
        console.error("Error sending message:", error);
        if (!reply.raw.headersSent) {
          return reply.status(500).send({
            error: "InternalError",
            message:
              error instanceof Error ? error.message : "Failed to send message",
          });
        }
        try {
          const errorEvent =
            "event: error\ndata: " +
            JSON.stringify({
              error: "InternalError",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to send message",
            }) +
            "\n\n";
          reply.raw.write(errorEvent);
          reply.raw.write("event: end\ndata: {}\n\n");
          reply.raw.end();
        } catch {
          // Ignore
        }
      }
    },
  );
};
