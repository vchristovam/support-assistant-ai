import type { RunnableConfig } from "@langchain/core/runnables";
import { Command } from "@langchain/langgraph";
import type { FastifyInstance } from "fastify";
import { createGraph } from "../../../graph/index.js";
import { STATELESS_THREAD_ID } from "../constants.js";
import {
  createRun,
  getRunRecord,
  registerRun,
  setRunStatus,
} from "../runStore.js";
import { errorSchema, runBodySchema } from "../schemas.js";
import {
  hasStreamMode,
  normalizeStreamModes,
  toSerializable,
} from "../serialization.js";
import {
  attachRunStreamListener,
  completeRunStream,
  emitRunStreamEvent,
  getLastEventId,
  getOrCreateRunStream,
  resetRunStream,
} from "../streamStore.js";
import { isInterruptedResult } from "../state.js";
import type { RunBody, RunRecord, ThreadRunServices } from "../types.js";
import { getStatelessRunKey } from "../utils.js";

export const registerStatelessRunRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  const { checkpointer, llm } = services;

  app.post(
    "/runs/stream",
    {
      schema: {
        tags: ["runs"],
        summary: "Create stateless run and stream output",
        body: runBodySchema,
        response: {
          200: {
            type: "string",
            description: "SSE stream (text/event-stream).",
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = (request.body || {}) as RunBody;
      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        return reply.status(400).send({
          error: "BadRequest",
          message: "assistant_id is required",
        });
      }

      const run = createRun(
        STATELESS_THREAD_ID,
        body.assistant_id,
        body.metadata ?? {},
        body.multitask_strategy ?? null,
      );
      const runKey = getStatelessRunKey(run.run_id);
      registerRun(run);
      setRunStatus(run, "running");
      resetRunStream(runKey);
      attachRunStreamListener(runKey, reply, 0, {
        "Content-Location": `/runs/${run.run_id}`,
      });

      const streamModes = normalizeStreamModes(body.stream_mode);

      try {
        emitRunStreamEvent(runKey, "metadata", {
          run_id: run.run_id,
          thread_id: STATELESS_THREAD_ID,
          assistant_id: body.assistant_id,
        });

        const graph = createGraph(checkpointer, llm);
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});
        const result = await graph.invoke(
          invokeInput,
          body.config as RunnableConfig,
        );

        const serialized = toSerializable(result);
        if (hasStreamMode(streamModes, "values")) {
          emitRunStreamEvent(runKey, "values", serialized);
        }
        if (hasStreamMode(streamModes, "updates")) {
          emitRunStreamEvent(runKey, "updates", {
            graph: serialized,
          });
        }

        setRunStatus(
          run,
          isInterruptedResult(result) ? "interrupted" : "success",
        );
        emitRunStreamEvent(runKey, "end", {});
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Streaming run failed";
        setRunStatus(run, "error", message);
        emitRunStreamEvent(runKey, "error", {
          error: "StreamError",
          message,
        });
        emitRunStreamEvent(runKey, "end", {});
      } finally {
        completeRunStream(runKey);
      }
    },
  );

  app.post("/runs", async (request, reply) => {
    const body = (request.body || {}) as RunBody;
    if (!body.assistant_id || typeof body.assistant_id !== "string") {
      return reply.status(400).send({
        error: "BadRequest",
        message: "assistant_id is required",
      });
    }

    const run = createRun(
      STATELESS_THREAD_ID,
      body.assistant_id,
      body.metadata ?? {},
      body.multitask_strategy ?? null,
    );
    registerRun(run);
    setRunStatus(run, "pending");

    void (async () => {
      setRunStatus(run, "running");
      try {
        const graph = createGraph(checkpointer, llm);
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});
        const result = await graph.invoke(
          invokeInput,
          body.config as RunnableConfig,
        );
        setRunStatus(
          run,
          isInterruptedResult(result) ? "interrupted" : "success",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Run execution failed";
        setRunStatus(run, "error", message);
      }
    })();

    reply.header("Content-Location", `/runs/${run.run_id}`);
    return reply.send(run);
  });

  app.post("/runs/wait", async (request, reply) => {
    const body = (request.body || {}) as RunBody;
    if (!body.assistant_id || typeof body.assistant_id !== "string") {
      return reply.status(400).send({
        error: "BadRequest",
        message: "assistant_id is required",
      });
    }

    const run = createRun(
      STATELESS_THREAD_ID,
      body.assistant_id,
      body.metadata ?? {},
      body.multitask_strategy ?? null,
    );
    registerRun(run);
    setRunStatus(run, "running");
    try {
      const graph = createGraph(checkpointer, llm);
      const invokeInput = body.command
        ? new Command(body.command)
        : (body.input ?? {});
      const result = await graph.invoke(
        invokeInput,
        body.config as RunnableConfig,
      );
      setRunStatus(
        run,
        isInterruptedResult(result) ? "interrupted" : "success",
      );
      reply.header("Content-Location", `/runs/${run.run_id}`);
      return reply.send(toSerializable(result));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Run wait failed";
      setRunStatus(run, "error", message);
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.get("/runs/:run_id/stream", async (request, reply) => {
    const { run_id: runId } = request.params as { run_id: string };
    const run = getRunRecord(undefined, runId);
    if (!run) {
      return reply.status(404).send({
        error: "NotFound",
        message: "Run not found",
      });
    }

    const runKey = getStatelessRunKey(runId);
    const stream = getOrCreateRunStream(runKey);
    if (stream.events.length === 0) {
      emitRunStreamEvent(runKey, "metadata", {
        run_id: run.run_id,
        thread_id: STATELESS_THREAD_ID,
        assistant_id: run.assistant_id,
      });
      emitRunStreamEvent(runKey, "end", {});
      completeRunStream(runKey);
    }

    const lastEventId = getLastEventId(request);
    attachRunStreamListener(runKey, reply, lastEventId);
  });

  app.post("/runs/batch", async (request, reply) => {
    const payload = (request.body || []) as RunBody[];
    if (!Array.isArray(payload)) {
      return reply.status(400).send({
        error: "BadRequest",
        message: "Body must be an array",
      });
    }

    const results: RunRecord[] = [];
    for (const body of payload) {
      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        continue;
      }
      const run = createRun(
        STATELESS_THREAD_ID,
        body.assistant_id,
        body.metadata ?? {},
        body.multitask_strategy ?? null,
      );
      registerRun(run);
      setRunStatus(run, "pending");
      results.push(run);
    }
    return reply.send(results);
  });
};
