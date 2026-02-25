import type { RunnableConfig } from "@langchain/core/runnables";
import { Command } from "@langchain/langgraph";
import type { FastifyInstance } from "fastify";
import { createGraph } from "../../../graph/index.js";
import {
  isFinalRunStatus,
  validRunStatuses,
  type ValidRunStatus,
} from "../constants.js";
import {
  createRun,
  deleteRunAbortController,
  getOrCreateRun,
  getRunAbortController,
  getRunByKey,
  getRunByThread,
  listRunsByThread,
  registerRun,
  removeRun,
  setRunAbortController,
  setRunStatus,
  waitForRunCompletion,
} from "../runStore.js";
import { errorSchema, runBodySchema, runSchema } from "../schemas.js";
import {
  getStreamNamespace,
  hasStreamMode,
  normalizeStreamModes,
  toMessageLike,
  toSerializable,
  withNamespace,
} from "../serialization.js";
import {
  attachRunStreamListener,
  completeRunStream,
  deleteRunStream,
  emitRunStreamEvent,
  getLastEventId,
  getOrCreateRunStream,
  resetRunStream,
  setupSSEHeaders,
  writeSSE,
} from "../streamStore.js";
import {
  buildRunnableConfig,
  buildStateResponseFromTuple,
  isInterruptedResult,
  loadThreadValues,
  parseInterruptCommand,
  updateThreadStatusSafe,
} from "../state.js";
import type {
  CancelRunQuery,
  InterruptBody,
  RunBody,
  SearchRunsQuery,
  ThreadRunServices,
} from "../types.js";
import {
  getRunKey,
  getUserId,
  isRecord,
  toErrorMessage,
  toPositiveInt,
} from "../utils.js";

export const registerThreadRunRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  const { threadRepository, checkpointer, llm } = services;

  app.post(
    "/threads/:thread_id/runs",
    {
      schema: {
        tags: ["runs"],
        summary: "Create run",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        body: runBodySchema,
        response: {
          200: runSchema,
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId } = request.params as { thread_id: string };
        const body = (request.body || {}) as RunBody;

        if (!body.assistant_id || typeof body.assistant_id !== "string") {
          return reply.status(400).send({
            error: "BadRequest",
            message: "assistant_id is required",
          });
        }

        const thread = await threadRepository.getThread(threadId, userId);
        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const run = createRun(
          threadId,
          body.assistant_id,
          body.metadata ?? {},
          body.multitask_strategy ?? null,
        );
        registerRun(run);
        setRunStatus(run, "pending");

        void (async () => {
          await updateThreadStatusSafe(threadRepository, threadId, "busy");
          setRunStatus(run, "running");
          const runKey = getRunKey(threadId, run.run_id);
          const abortController = new AbortController();
          setRunAbortController(runKey, abortController);

          try {
            const graph = createGraph(checkpointer, llm);
            const config = {
              ...buildRunnableConfig(threadId, body.config),
              signal: abortController.signal,
            } as RunnableConfig;
            const invokeInput = body.command
              ? new Command(body.command)
              : (body.input ?? {});
            const result = await graph.invoke(invokeInput, config);

            if (isInterruptedResult(result)) {
              setRunStatus(run, "interrupted");
              await updateThreadStatusSafe(
                threadRepository,
                threadId,
                "interrupted",
              );
              return;
            }

            setRunStatus(run, "success");
            await updateThreadStatusSafe(threadRepository, threadId, "idle");
          } catch (error) {
            if (abortController.signal.aborted) {
              setRunStatus(run, "interrupted", "Run cancelled");
              await updateThreadStatusSafe(
                threadRepository,
                threadId,
                "interrupted",
              );
              return;
            }
            const message =
              error instanceof Error ? error.message : "Run execution failed";
            setRunStatus(run, "error", message);
            await updateThreadStatusSafe(threadRepository, threadId, "error");
          } finally {
            deleteRunAbortController(runKey);
          }
        })();

        reply.header(
          "Content-Location",
          `/threads/${threadId}/runs/${run.run_id}`,
        );
        return reply.send(run);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.get(
    "/threads/:thread_id/runs",
    {
      schema: {
        tags: ["runs"],
        summary: "List runs",
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
            offset: { type: "integer", minimum: 0 },
            status: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: runSchema,
          },
          400: errorSchema,
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId } = request.params as { thread_id: string };
        const query = (request.query || {}) as SearchRunsQuery;
        const thread = await threadRepository.getThread(threadId, userId);

        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const status =
          typeof query.status === "string" ? query.status : undefined;
        if (status && !validRunStatuses.includes(status as ValidRunStatus)) {
          return reply.status(400).send({
            error: "BadRequest",
            message: `status must be one of: ${validRunStatuses.join(", ")}`,
          });
        }

        const runsList = listRunsByThread(threadId, {
          limit: Math.max(1, toPositiveInt(query.limit, 10)),
          offset: Math.max(0, toPositiveInt(query.offset, 0)),
          status,
        });
        return reply.send(runsList);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to list runs";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.get(
    "/threads/:thread_id/runs/:run_id",
    {
      schema: {
        tags: ["runs"],
        summary: "Get run",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
            run_id: { type: "string" },
          },
          required: ["thread_id", "run_id"],
        },
        response: {
          200: runSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      const { thread_id: threadId, run_id: runId } = request.params as {
        thread_id: string;
        run_id: string;
      };
      const thread = await threadRepository.getThread(threadId, userId);
      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }
      const run = getRunByThread(threadId, runId);
      if (!run) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Run not found",
        });
      }
      return reply.send(run);
    },
  );

  app.post(
    "/threads/:thread_id/runs/:run_id/cancel",
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId, run_id: runId } = request.params as {
          thread_id: string;
          run_id: string;
        };
        const query = (request.query || {}) as CancelRunQuery;
        const thread = await threadRepository.getThread(threadId, userId);
        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const run = getRunByThread(threadId, runId);
        if (!run) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Run not found",
          });
        }

        const runKey = getRunKey(threadId, runId);
        getRunAbortController(runKey)?.abort();
        setRunStatus(
          run,
          "interrupted",
          query.action === "rollback" ? "Run rolled back" : "Run cancelled",
        );
        await updateThreadStatusSafe(threadRepository, threadId, "interrupted");

        const shouldWait =
          typeof query.wait === "string" ? query.wait === "1" : false;
        if (shouldWait) {
          const completed = await waitForRunCompletion(run);
          return reply.send(completed);
        }

        return reply.send(run);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to cancel run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.get(
    "/threads/:thread_id/runs/:run_id/join",
    {
      schema: {
        tags: ["runs"],
        summary: "Wait for run completion and return thread values",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
            run_id: { type: "string" },
          },
          required: ["thread_id", "run_id"],
        },
        response: {
          200: {
            type: "object",
            additionalProperties: true,
          },
          404: errorSchema,
          500: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId, run_id: runId } = request.params as {
          thread_id: string;
          run_id: string;
        };
        const thread = await threadRepository.getThread(threadId, userId);
        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const run = getRunByThread(threadId, runId);
        if (!run) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Run not found",
          });
        }

        await waitForRunCompletion(run);
        const values = await loadThreadValues(checkpointer, threadId);
        return reply.send(values);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.get(
    "/threads/:thread_id/runs/:run_id/stream",
    {
      schema: {
        tags: ["runs"],
        summary: "Join stream for an existing run",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
            run_id: { type: "string" },
          },
          required: ["thread_id", "run_id"],
        },
        querystring: {
          type: "object",
          properties: {
            cancel_on_disconnect: { type: "string" },
          },
        },
        response: {
          200: {
            type: "string",
            description: "SSE stream (text/event-stream).",
          },
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      const { thread_id: threadId, run_id: runId } = request.params as {
        thread_id: string;
        run_id: string;
      };
      const query = (request.query || {}) as {
        cancel_on_disconnect?: string;
      };

      const thread = await threadRepository.getThread(threadId, userId);
      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const run = getRunByThread(threadId, runId);
      if (!run) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Run not found",
        });
      }

      const runKey = getRunKey(threadId, runId);
      const stream = getOrCreateRunStream(runKey);
      if (stream.events.length === 0) {
        emitRunStreamEvent(runKey, "metadata", {
          run_id: run.run_id,
          thread_id: threadId,
          assistant_id: run.assistant_id,
        });
        emitRunStreamEvent(runKey, "end", {});
        completeRunStream(runKey);
      }

      const lastEventId = getLastEventId(request);
      attachRunStreamListener(runKey, reply, lastEventId);

      if (query.cancel_on_disconnect === "1") {
        reply.raw.on("close", async () => {
          const current = getRunByKey(runKey);
          if (!current || isFinalRunStatus(current.status)) {
            return;
          }
          getRunAbortController(runKey)?.abort();
          setRunStatus(current, "interrupted", "Client disconnected");
          await updateThreadStatusSafe(
            threadRepository,
            threadId,
            "interrupted",
          );
        });
      }
    },
  );

  app.delete("/threads/:thread_id/runs/:run_id", async (request, reply) => {
    const userId = getUserId(request);
    const { thread_id: threadId, run_id: runId } = request.params as {
      thread_id: string;
      run_id: string;
    };
    const thread = await threadRepository.getThread(threadId, userId);
    if (!thread) {
      return reply.status(404).send({
        error: "NotFound",
        message: "Thread not found",
      });
    }

    const runKey = getRunKey(threadId, runId);
    const run = getRunByThread(threadId, runId);
    if (!run) {
      return reply.status(404).send({
        error: "NotFound",
        message: "Run not found",
      });
    }

    getRunAbortController(runKey)?.abort();
    removeRun(runKey, runId);
    deleteRunStream(runKey);

    return reply.status(204).send();
  });

  app.post(
    "/threads/:thread_id/runs/:run_id/interrupt",
    async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId, run_id: runId } = request.params as {
          thread_id: string;
          run_id: string;
        };
        const body = (request.body || {}) as InterruptBody;

        const thread = await threadRepository.getThread(threadId, userId);
        if (!thread) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Thread not found",
          });
        }

        const parsed = parseInterruptCommand(body);
        if (!parsed.command) {
          return reply.status(400).send({
            error: "BadRequest",
            message: parsed.error ?? "Invalid interrupt payload",
          });
        }

        const run = getOrCreateRun(threadId, runId);
        setRunStatus(run, "running");
        await updateThreadStatusSafe(threadRepository, threadId, "busy");

        try {
          const graph = createGraph(checkpointer, llm);
          const config = buildRunnableConfig(threadId);
          const result = await graph.invoke(
            new Command(parsed.command),
            config,
          );

          if (isInterruptedResult(result)) {
            setRunStatus(run, "interrupted");
            await updateThreadStatusSafe(
              threadRepository,
              threadId,
              "interrupted",
            );
            return reply.send(run);
          }

          setRunStatus(run, "success");
          await updateThreadStatusSafe(threadRepository, threadId, "idle");
          return reply.send(run);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to resume run";
          setRunStatus(run, "error", message);
          await updateThreadStatusSafe(threadRepository, threadId, "error");
          return reply.status(500).send({
            error: "InternalError",
            message,
            run_id: run.run_id,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to resume run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    },
  );

  app.post(
    "/threads/:thread_id/runs/stream",
    {
      schema: {
        tags: ["runs"],
        summary: "Create run and stream output",
        params: {
          type: "object",
          properties: {
            thread_id: { type: "string" },
          },
          required: ["thread_id"],
        },
        body: runBodySchema,
        response: {
          200: {
            type: "string",
            description: "SSE stream (text/event-stream).",
          },
          400: errorSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as RunBody;

      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        return reply.status(400).send({
          error: "BadRequest",
          message: "assistant_id is required",
        });
      }

      const thread = await threadRepository.getThread(threadId, userId);
      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const run = createRun(
        threadId,
        body.assistant_id,
        body.metadata ?? {},
        body.multitask_strategy ?? null,
      );
      const runKey = getRunKey(threadId, run.run_id);
      registerRun(run);
      setRunStatus(run, "running");
      resetRunStream(runKey);
      attachRunStreamListener(runKey, reply, 0, {
        "Content-Location": `/threads/${threadId}/runs/${run.run_id}`,
      });
      await updateThreadStatusSafe(threadRepository, threadId, "busy");

      const abortController = new AbortController();
      setRunAbortController(runKey, abortController);
      const streamModes = normalizeStreamModes(body.stream_mode);
      const streamSubgraphs = Boolean(body.stream_subgraphs);
      let interrupted = false;

      try {
        emitRunStreamEvent(runKey, "metadata", {
          run_id: run.run_id,
          thread_id: threadId,
          assistant_id: body.assistant_id,
        });

        const graph = createGraph(checkpointer, llm);
        const config = {
          ...buildRunnableConfig(threadId, body.config),
          version: "v2" as const,
          streamSubgraphs,
          signal: abortController.signal,
        };
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});

        const stream = await graph.streamEvents(invokeInput, config);

        for await (const rawEvent of stream) {
          const event = rawEvent as Record<string, unknown>;
          const eventName = event.event as string;
          const namespace = streamSubgraphs
            ? getStreamNamespace(event)
            : undefined;

          if (hasStreamMode(streamModes, "events")) {
            const serializedEvent = toSerializable(event);
            emitRunStreamEvent(
              runKey,
              withNamespace("events", namespace),
              serializedEvent && typeof serializedEvent === "object"
                ? serializedEvent
                : { value: serializedEvent },
            );
          }

          if (eventName === "__interrupt__") {
            interrupted = true;
            const interruptData = toSerializable(event.data);
            const nodeName =
              typeof event.name === "string" && event.name.length > 0
                ? event.name
                : "__interrupt__";

            if (hasStreamMode(streamModes, "updates")) {
              emitRunStreamEvent(runKey, withNamespace("updates", namespace), {
                [nodeName]: {
                  __interrupt__: interruptData,
                },
              });
            }

            emitRunStreamEvent(runKey, "interrupts", interruptData);
            break;
          }

          if (eventName === "on_chain_end") {
            const data =
              (event.data as Record<string, unknown> | undefined) ?? {};
            const output = data.output;
            if (output && typeof output === "object") {
              const serializedOutput = toSerializable(output);
              const nodeName =
                typeof event.name === "string" && event.name.length > 0
                  ? event.name
                  : "graph";

              if (hasStreamMode(streamModes, "values")) {
                emitRunStreamEvent(
                  runKey,
                  withNamespace("values", namespace),
                  serializedOutput,
                );
              }
              if (hasStreamMode(streamModes, "updates")) {
                emitRunStreamEvent(
                  runKey,
                  withNamespace("updates", namespace),
                  {
                    [nodeName]: serializedOutput,
                  },
                );
              }
            }
          }

          if (
            eventName === "on_chat_model_stream" &&
            (hasStreamMode(streamModes, "messages") ||
              hasStreamMode(streamModes, "messages-tuple"))
          ) {
            const data =
              (event.data as Record<string, unknown> | undefined) ?? {};
            const rawChunk = data.chunk;
            const messageChunk = toMessageLike(rawChunk, "ai");
            if (
              typeof messageChunk.id !== "string" ||
              messageChunk.id.length === 0
            ) {
              messageChunk.id =
                typeof event.run_id === "string" && event.run_id.length > 0
                  ? event.run_id
                  : run.run_id;
            }

            const messageMetadata: Record<string, unknown> = {
              run_id:
                typeof event.run_id === "string" && event.run_id.length > 0
                  ? event.run_id
                  : run.run_id,
              name: event.name,
              metadata: toSerializable(event.metadata),
              tags: Array.isArray(event.tags) ? event.tags : [],
            };
            if (namespace) {
              messageMetadata.langgraph_checkpoint_ns = namespace;
            }

            emitRunStreamEvent(runKey, withNamespace("messages", namespace), [
              messageChunk,
              messageMetadata,
            ]);
          }

          if (
            eventName === "on_tool_start" ||
            eventName === "on_tool_end" ||
            eventName === "on_tool_error"
          ) {
            if (hasStreamMode(streamModes, "tasks")) {
              const taskId =
                typeof event.run_id === "string"
                  ? event.run_id
                  : `${run.run_id}:${Date.now()}`;
              const taskName =
                typeof event.name === "string" && event.name.length > 0
                  ? event.name
                  : "tool";
              let taskPayload: Record<string, unknown>;

              if (eventName === "on_tool_start") {
                taskPayload = {
                  id: taskId,
                  name: taskName,
                  interrupts: [],
                  input: toSerializable(event.data),
                };
              } else if (eventName === "on_tool_end") {
                taskPayload = {
                  id: taskId,
                  name: taskName,
                  interrupts: [],
                  result: [[taskName, toSerializable(event.data)]],
                };
              } else {
                const data = toSerializable(event.data);
                taskPayload = {
                  id: taskId,
                  name: taskName,
                  interrupts: [],
                  error:
                    isRecord(data) && typeof data.error === "string"
                      ? data.error
                      : toErrorMessage(data, "Tool execution failed"),
                };
              }

              emitRunStreamEvent(runKey, withNamespace("tasks", namespace), {
                ...taskPayload,
              });
            }
          }
        }

        const finalValues = await loadThreadValues(checkpointer, threadId);
        if (hasStreamMode(streamModes, "checkpoints")) {
          emitRunStreamEvent(runKey, "checkpoints", {
            values: finalValues,
            next: [],
            config: {
              configurable: {
                thread_id: threadId,
              },
            },
            metadata: {},
            tasks: [],
          });
        }

        setRunStatus(run, interrupted ? "interrupted" : "success");
        await updateThreadStatusSafe(
          threadRepository,
          threadId,
          interrupted ? "interrupted" : "idle",
        );
        emitRunStreamEvent(runKey, "end", {});
      } catch (error) {
        if (abortController.signal.aborted) {
          setRunStatus(run, "interrupted", "Run cancelled");
          await updateThreadStatusSafe(
            threadRepository,
            threadId,
            "interrupted",
          );
          emitRunStreamEvent(runKey, "end", {});
        } else {
          const message =
            error instanceof Error ? error.message : "Streaming run failed";
          setRunStatus(run, "error", message);
          await updateThreadStatusSafe(threadRepository, threadId, "error");
          emitRunStreamEvent(runKey, "error", {
            error: "StreamError",
            message,
          });
          emitRunStreamEvent(runKey, "end", {});
        }
      } finally {
        deleteRunAbortController(runKey);
        completeRunStream(runKey);
      }
    },
  );

  app.post("/threads/:thread_id/runs/wait", async (request, reply) => {
    try {
      const userId = getUserId(request);
      const { thread_id: threadId } = request.params as { thread_id: string };
      const body = (request.body || {}) as RunBody;

      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        return reply.status(400).send({
          error: "BadRequest",
          message: "assistant_id is required",
        });
      }

      const thread = await threadRepository.getThread(threadId, userId);
      if (!thread) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Thread not found",
        });
      }

      const run = createRun(
        threadId,
        body.assistant_id,
        body.metadata ?? {},
        body.multitask_strategy ?? null,
      );
      registerRun(run);
      setRunStatus(run, "running");
      await updateThreadStatusSafe(threadRepository, threadId, "busy");

      try {
        const graph = createGraph(checkpointer, llm);
        const config = buildRunnableConfig(threadId, body.config);
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});
        const result = await graph.invoke(invokeInput, config);

        if (isInterruptedResult(result)) {
          setRunStatus(run, "interrupted");
          await updateThreadStatusSafe(
            threadRepository,
            threadId,
            "interrupted",
          );
        } else {
          setRunStatus(run, "success");
          await updateThreadStatusSafe(threadRepository, threadId, "idle");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Run wait failed";
        setRunStatus(run, "error", message);
        await updateThreadStatusSafe(threadRepository, threadId, "error");
      }

      const state = await checkpointer
        .getTuple({
          configurable: { thread_id: threadId },
        } as RunnableConfig)
        .catch(() => undefined);

      reply.header(
        "Content-Location",
        `/threads/${threadId}/runs/${run.run_id}`,
      );
      return reply.send(buildStateResponseFromTuple(threadId, state).values);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to wait for run";
      return reply.status(500).send({
        error: "InternalError",
        message,
      });
    }
  });

  app.get("/threads/:thread_id/stream", async (request, reply) => {
    const userId = getUserId(request);
    const { thread_id: threadId } = request.params as { thread_id: string };
    const thread = await threadRepository.getThread(threadId, userId);
    if (!thread) {
      return reply.status(404).send({
        error: "NotFound",
        message: "Thread not found",
      });
    }

    const latestRun = listRunsByThread(threadId, { limit: 1, offset: 0 })[0];
    if (!latestRun) {
      setupSSEHeaders(reply);
      writeSSE(reply, 1, "end", {});
      reply.raw.end();
      return;
    }

    const runKey = getRunKey(threadId, latestRun.run_id);
    const lastEventId = getLastEventId(request);
    attachRunStreamListener(runKey, reply, lastEventId);
  });
};
