import type { RunnableConfig } from "@langchain/core/runnables";
import type { FastifyInstance } from "fastify";
import { createGraph } from "../../../graph/index.js";
import { errorSchema, threadStateSchema } from "../schemas.js";
import { createRun, registerRun, setRunStatus } from "../runStore.js";
import {
  buildRunnableConfig,
  buildStateResponseFromTuple,
  loadThreadHistory,
} from "../state.js";
import type {
  ThreadHistoryBody,
  ThreadRunServices,
  ThreadStateCheckpointBody,
  ThreadStatePatchBody,
  ThreadStateUpdateBody,
} from "../types.js";
import { getUserId, toPositiveInt } from "../utils.js";

export const registerThreadStateRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  const { threadRepository, checkpointer, llm } = services;

  app.get(
    "/threads/:thread_id/state",
    {
      schema: {
        tags: ["threads"],
        summary: "Get thread state",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        response: {
          200: threadStateSchema,
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

        const tuple = await checkpointer
          .getTuple({
            configurable: { thread_id: threadId },
          } as RunnableConfig)
          .catch(() => undefined);

        return reply.send(buildStateResponseFromTuple(threadId, tuple));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve state";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.get(
    "/threads/:thread_id/state/:checkpoint_id",
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId, checkpoint_id: checkpointId } =
          request.params as {
            thread_id: string;
            checkpoint_id: string;
          };
        const thread = await threadRepository.getThread(threadId, userId);

        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const tuple = await checkpointer
          .getTuple({
            configurable: {
              thread_id: threadId,
              checkpoint_id: checkpointId,
            },
          } as RunnableConfig)
          .catch(() => undefined);

        return reply.send(buildStateResponseFromTuple(threadId, tuple));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve state";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.post("/threads/:thread_id/state/checkpoint", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as ThreadStateCheckpointBody;
      const thread = await threadRepository.getThread(threadId, userId);

      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const checkpointConfig =
        typeof body.checkpoint?.configurable === "object" &&
        body.checkpoint?.configurable !== null
          ? (body.checkpoint.configurable as Record<string, unknown>)
          : {};

      const tuple = await checkpointer
        .getTuple({
          configurable: {
            ...checkpointConfig,
            thread_id: threadId,
          },
        } as RunnableConfig)
        .catch(() => undefined);

      return reply.send(buildStateResponseFromTuple(threadId, tuple));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to retrieve state";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.post("/threads/:thread_id/state", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as ThreadStateUpdateBody;
      const thread = await threadRepository.getThread(threadId, userId);

      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      if (body.values && typeof body.values === "object") {
        const run = createRun(threadId, "agent", { source: "update_state" });
        registerRun(run);
        setRunStatus(run, "running");

        try {
          const graph = createGraph(checkpointer, llm);
          const config = buildRunnableConfig(threadId, {
            configurable: {
              checkpoint_id: body.checkpoint_id,
            },
          });
          await graph.invoke(body.values, config);
          setRunStatus(run, "success");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to update state";
          setRunStatus(run, "error", message);
        }
      }

      const tuple = await checkpointer
        .getTuple({
          configurable: { thread_id: threadId },
        } as RunnableConfig)
        .catch(() => undefined);
      return reply.send(buildStateResponseFromTuple(threadId, tuple));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update state";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.patch("/threads/:thread_id/state", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as ThreadStatePatchBody;
      const thread = await threadRepository.getThread(threadId, userId);

      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      if (body.metadata && typeof body.metadata === "object") {
        await threadRepository.updateThreadMetadata(threadId, {
          ...thread.metadata,
          ...body.metadata,
        });
      }
      return reply.status(204).send();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to patch state";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.get(
    "/threads/:thread_id/history",
    {
      schema: {
        tags: ["threads"],
        summary: "Get thread history",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1 },
          },
        },
        response: {
          200: {
            type: "array",
            items: threadStateSchema,
          },
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

        const limit = Math.max(
          1,
          toPositiveInt((request.query as { limit?: string })?.limit, 10),
        );
        const states = await loadThreadHistory(
          checkpointer,
          threadId,
          limit,
        ).catch(() => []);
        return reply.send(states);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve history";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.post(
    "/threads/:thread_id/history",
    {
      schema: {
        tags: ["threads"],
        summary: "Get thread history (POST)",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        body: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1 },
            before: { type: "object", additionalProperties: true },
            metadata: { type: "object", additionalProperties: true },
            checkpoint: { type: "object", additionalProperties: true },
          },
        },
        response: {
          200: {
            type: "array",
            items: threadStateSchema,
          },
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId } = request.params as { thread_id: string };
        const body = (request.body || {}) as ThreadHistoryBody;
        const thread = await threadRepository.getThread(threadId, userId);

        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const limit = Math.max(1, body.limit ?? 10);
        const states = await loadThreadHistory(
          checkpointer,
          threadId,
          limit,
        ).catch(() => []);
        return reply.send(states);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve history";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );
};
