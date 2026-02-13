import type { FastifyInstance } from "fastify";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ThreadRepository } from "../../repositories/threadRepository.js";
import { ConversationRepository } from "../../repositories/conversationRepository.js";
import { createThread, getThread, getThreadHistory } from "../threads.js";
import { routeSchemas } from "../swagger.js";

export const registerThreadRoutes = (
  app: FastifyInstance,
  threadRepository: ThreadRepository | undefined,
  conversationRepository: ConversationRepository | undefined,
  checkpointer: BaseCheckpointSaver,
) => {
  app.post(
    "/api/threads",
    routeSchemas.createThread,
    async (request, reply) => {
      try {
        const { thread_id, metadata } = request.body as {
          thread_id?: string;
          metadata?: Record<string, unknown>;
        };
        const user = (request as unknown as Record<string, unknown>).user as
          | { user_id: string }
          | undefined;
        const userId = user?.user_id ?? "anonymous";

        if (threadRepository) {
          const thread = await createThread(
            { thread_id, metadata },
            threadRepository,
            userId,
          );
          return thread;
        } else {
          reply.status(503);
          return {
            error: "ServiceUnavailable",
            message: "Thread repository not available",
          };
        }
      } catch (error) {
        reply.status(400);
        return {
          error: "BadRequest",
          message: (error as Error).message,
        };
      }
    },
  );

  app.get(
    "/api/threads/:thread_id",
    routeSchemas.getThread,
    async (request, reply) => {
      const { thread_id } = request.params as { thread_id: string };
      const user = (request as unknown as Record<string, unknown>).user as
        | { user_id: string }
        | undefined;
      const userId = user?.user_id ?? "anonymous";

      try {
        if (threadRepository) {
          const thread = await getThread(
            thread_id,
            threadRepository,
            userId,
            checkpointer,
          );

          if (!thread) {
            reply.status(404);
            return {
              error: "NotFound",
              message: `Thread '${thread_id}' not found`,
            };
          }

          return thread;
        } else {
          reply.status(503);
          return {
            error: "ServiceUnavailable",
            message: "Thread repository not available",
          };
        }
      } catch (error) {
        reply.status(500);
        return {
          error: "InternalError",
          message: (error as Error).message,
        };
      }
    },
  );

  app.get(
    "/api/threads/:thread_id/history",
    routeSchemas.getThreadHistory,
    async (request, reply) => {
      const { thread_id } = request.params as { thread_id: string };
      const user = (request as unknown as Record<string, unknown>).user as
        | { user_id: string }
        | undefined;
      const userId = user?.user_id ?? "anonymous";

      try {
        if (conversationRepository && threadRepository) {
          const messages = await getThreadHistory(
            thread_id,
            conversationRepository,
            userId,
            threadRepository,
          );

          if (messages === null) {
            reply.status(404);
            return {
              error: "NotFound",
              message: `Thread '${thread_id}' not found`,
            };
          }

          return { messages };
        } else {
          reply.status(503);
          return {
            error: "ServiceUnavailable",
            message: "Conversation repository not available",
          };
        }
      } catch (error) {
        reply.status(500);
        return {
          error: "InternalError",
          message: (error as Error).message,
        };
      }
    },
  );
};
