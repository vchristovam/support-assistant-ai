import type { FastifyInstance } from "fastify";
import { errorSchema, threadSchema } from "../schemas.js";
import { createThreadResponse, loadThreadValues } from "../state.js";
import type {
  CountThreadsBody,
  CreateThreadBody,
  SearchThreadsBody,
  ThreadPatchBody,
  ThreadRunServices,
} from "../types.js";
import { getUserId, matchesRecord } from "../utils.js";
import { type ValidThreadStatus, validThreadStatuses } from "../constants.js";

export const registerThreadRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  const { threadRepository, checkpointer } = services;

  app.post(
    "/threads/search",
    {
      schema: {
        tags: ["threads"],
        summary: "Search threads",
        body: {
          type: "object",
          properties: {
            metadata: { type: "object", additionalProperties: true },
            ids: { type: "array", items: { type: "string" } },
            limit: { type: "integer", minimum: 1 },
            offset: { type: "integer", minimum: 0 },
            status: { type: "string" },
            values: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: {
            type: "array",
            items: threadSchema,
          },
          400: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const body = (request.body || {}) as SearchThreadsBody;
        const limit = Math.max(1, body.limit ?? 10);
        const offset = Math.max(0, body.offset ?? 0);

        let status: ValidThreadStatus | undefined;
        if (typeof body.status === "string" && body.status.length > 0) {
          if (!validThreadStatuses.includes(body.status as ValidThreadStatus)) {
            return reply.status(400).send({
              error: "BadRequest",
              message: `status must be one of: ${validThreadStatuses.join(", ")}`,
            });
          }
          status = body.status as ValidThreadStatus;
        }

        const threads = await threadRepository.getThreadsByUser(userId, {
          limit: Math.max(limit + offset, 50),
          offset: 0,
          status,
        });

        const filtered = threads
          .filter((thread) =>
            body.ids && body.ids.length > 0
              ? body.ids.includes(thread.thread_id)
              : true,
          )
          .filter((thread) => matchesRecord(body.metadata, thread.metadata))
          .slice(offset, offset + limit);

        const response = filtered.map((thread) => ({
          thread_id: thread.thread_id,
          created_at: thread.created_at.toISOString(),
          updated_at: thread.updated_at.toISOString(),
          state_updated_at: thread.updated_at.toISOString(),
          metadata: thread.metadata,
          status: thread.status,
          values: {},
          interrupts: {},
        }));

        return reply.send(response);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to search threads";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.post("/threads/count", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const body = (request.body || {}) as CountThreadsBody;
      let status: ValidThreadStatus | undefined;

      if (typeof body.status === "string" && body.status.length > 0) {
        if (!validThreadStatuses.includes(body.status as ValidThreadStatus)) {
          return reply.status(400).send({
            error: "BadRequest",
            message: `status must be one of: ${validThreadStatuses.join(", ")}`,
          });
        }
        status = body.status as ValidThreadStatus;
      }

      const threads = await threadRepository.getThreadsByUser(userId, {
        limit: 10_000,
        offset: 0,
        status,
      });
      const count = threads.filter((thread) =>
        matchesRecord(body.metadata, thread.metadata),
      ).length;

      return reply.send(count);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to count threads";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.get("/threads", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const query = (request.query || {}) as {
        limit?: string | number;
        offset?: string | number;
        status?: string;
      };

      const limit =
        typeof query.limit === "number"
          ? query.limit
          : typeof query.limit === "string"
            ? Number(query.limit)
            : 50;
      const offset =
        typeof query.offset === "number"
          ? query.offset
          : typeof query.offset === "string"
            ? Number(query.offset)
            : 0;

      if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1) {
        return reply.status(400).send({
          error: "BadRequest",
          message: "limit must be a positive integer",
        });
      }

      if (!Number.isFinite(offset) || !Number.isInteger(offset) || offset < 0) {
        return reply.status(400).send({
          error: "BadRequest",
          message: "offset must be a non-negative integer",
        });
      }

      let status: ValidThreadStatus | undefined;
      if (typeof query.status === "string" && query.status.length > 0) {
        if (!validThreadStatuses.includes(query.status as ValidThreadStatus)) {
          return reply.status(400).send({
            error: "BadRequest",
            message: `status must be one of: ${validThreadStatuses.join(", ")}`,
          });
        }
        status = query.status as ValidThreadStatus;
      }

      const threads = await threadRepository.getThreadsByUser(userId, {
        limit,
        offset,
        status,
      });

      return reply.send({
        threads: threads.map((thread) => ({
          thread_id: thread.thread_id,
          created_at: thread.created_at.toISOString(),
          updated_at: thread.updated_at.toISOString(),
          state_updated_at: thread.updated_at.toISOString(),
          metadata: thread.metadata,
          status: thread.status,
          values: {},
          interrupts: {},
        })),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to list threads";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.post(
    "/threads",
    {
      schema: {
        tags: ["threads"],
        summary: "Create thread",
        body: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: threadSchema,
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const body = (request.body || {}) as CreateThreadBody;
        const metadata = body.metadata ?? {};
        const title =
          typeof metadata.title === "string" ? metadata.title : undefined;

        const thread = await threadRepository.createThread({
          thread_id: body.thread_id,
          user_id: userId,
          title,
          metadata,
        });

        return reply.send(createThreadResponse(thread, {}));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create thread";
        return reply.status(400).send({
          error: "BadRequest",
          message,
        });
      }
    },
  );

  app.post("/threads/:thread_id/copy", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const sourceThread = await threadRepository.getThread(threadId, userId);

      if (!sourceThread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const copiedThread = await threadRepository.createThread({
        user_id: userId,
        title: sourceThread.title ?? undefined,
        metadata: sourceThread.metadata,
      });
      const sourceValues = await loadThreadValues(checkpointer, threadId);
      return reply.send(createThreadResponse(copiedThread, sourceValues));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to copy thread";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.patch("/threads/:thread_id", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as ThreadPatchBody;
      const thread = await threadRepository.getThread(threadId, userId);

      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      if (body.metadata && typeof body.metadata === "object") {
        await threadRepository.updateThreadMetadata(threadId, body.metadata);
      }

      const updated = await threadRepository.getThread(threadId, userId);
      if (!updated) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const values = await loadThreadValues(checkpointer, threadId);
      return reply.send(createThreadResponse(updated, values));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to patch thread";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.delete("/threads/:thread_id", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const thread = await threadRepository.getThread(threadId, userId);

      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      await threadRepository.deleteThread(threadId);
      try {
        await checkpointer.deleteThread(threadId);
      } catch {
        // Ignore checkpointer cleanup failures on delete.
      }
      return reply.status(204).send();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete thread";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.get(
    "/threads/:thread_id",
    {
      schema: {
        tags: ["threads"],
        summary: "Get thread",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        response: {
          200: threadSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId } = request.params as { thread_id: string };
        const thread = await threadRepository.getThread(threadId, userId);

        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const values = await loadThreadValues(checkpointer, threadId);
        return reply.send(createThreadResponse(thread, values));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve thread";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );
};
