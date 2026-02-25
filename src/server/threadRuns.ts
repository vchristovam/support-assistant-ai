import type { RunnableConfig } from "@langchain/core/runnables";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Command, type BaseCheckpointSaver } from "@langchain/langgraph";
import type { FastifyInstance, FastifyReply } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { createGraph } from "../graph/index.js";
import type { IThreadRepository, Thread } from "../repositories/index.js";

type StreamMode =
  | "values"
  | "updates"
  | "messages"
  | "messages-tuple"
  | "events"
  | "tasks"
  | "checkpoints"
  | "custom";

type RunStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "interrupted";

const validThreadStatuses = ["idle", "busy", "interrupted", "error"] as const;
type ValidThreadStatus = (typeof validThreadStatuses)[number];

interface RunRecord {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  status: RunStatus;
  metadata: Record<string, unknown>;
  kwargs: Record<string, unknown>;
  error?: string;
}

interface CreateThreadBody {
  thread_id?: string;
  metadata?: Record<string, unknown>;
}

interface RunBody {
  assistant_id?: string;
  input?: Record<string, unknown> | null;
  command?: Record<string, unknown>;
  stream_mode?: StreamMode | StreamMode[];
  stream_subgraphs?: boolean;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface InterruptBody {
  command?: Record<string, unknown>;
  resume?: unknown;
  decision?: "approve" | "accept" | "reject" | "edit";
  edited_action?: unknown;
  value?: unknown;
}

export interface ThreadRunServices {
  threadRepository: IThreadRepository;
  checkpointer: BaseCheckpointSaver;
  llm?: BaseChatModel;
}

const runs = new Map<string, RunRecord>();

const getRunKey = (threadId: string, runId: string): string =>
  `${threadId}:${runId}`;

const getUserId = (request: unknown): string => {
  const user = (request as Record<string, unknown>).user as
    | { user_id: string }
    | undefined;
  return user?.user_id ?? "anonymous";
};

const getIsoNow = (): string => new Date().toISOString();

const toSerializable = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }
  if (value && typeof value === "object") {
    const asMaybeMessage = value as {
      toDict?: () => unknown;
      toJSON?: () => unknown;
    };
    if (typeof asMaybeMessage.toDict === "function") {
      return toSerializable(asMaybeMessage.toDict());
    }
    if (typeof asMaybeMessage.toJSON === "function") {
      return toSerializable(asMaybeMessage.toJSON());
    }
    const serialized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      serialized[key] = toSerializable(nested);
    }
    return serialized;
  }
  return value;
};

const normalizeStreamModes = (
  mode: RunBody["stream_mode"],
): Set<StreamMode> => {
  if (Array.isArray(mode)) {
    return new Set(mode);
  }
  if (typeof mode === "string") {
    return new Set([mode]);
  }
  return new Set<StreamMode>(["values", "messages", "updates", "events"]);
};

const hasStreamMode = (
  modes: Set<StreamMode>,
  mode: StreamMode,
): boolean => {
  return modes.has(mode);
};

const parseCheckpointValues = (tuple: unknown): Record<string, unknown> => {
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

const parseInterruptsFromValues = (
  values: Record<string, unknown>,
): Record<string, unknown[]> => {
  const rawInterrupts = values.__interrupt__;
  if (Array.isArray(rawInterrupts)) {
    return { default: rawInterrupts };
  }
  return {};
};

const createThreadResponse = (
  thread: Thread,
  values: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    thread_id: thread.thread_id,
    created_at: thread.created_at.toISOString(),
    updated_at: thread.updated_at.toISOString(),
    metadata: thread.metadata,
    status: thread.status,
    values,
    interrupts: parseInterruptsFromValues(values),
  };
};

const createRun = (
  threadId: string,
  assistantId: string,
  metadata: Record<string, unknown> = {},
): RunRecord => {
  const now = getIsoNow();
  return {
    run_id: `run-${uuidv4()}`,
    thread_id: threadId,
    assistant_id: assistantId,
    created_at: now,
    updated_at: now,
    status: "pending",
    metadata,
    kwargs: {},
  };
};

const setRunStatus = (
  run: RunRecord,
  status: RunStatus,
  error?: string,
): RunRecord => {
  run.status = status;
  run.updated_at = getIsoNow();
  if (error) {
    run.error = error;
  } else {
    delete run.error;
  }
  runs.set(getRunKey(run.thread_id, run.run_id), run);
  return run;
};

const writeSSE = (
  reply: FastifyReply,
  id: number,
  event: string,
  data: unknown,
): void => {
  reply.raw.write(`id: ${id}\n`);
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

const buildRunnableConfig = (
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

const parseInterruptCommand = (
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

const updateThreadStatusSafe = async (
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

const loadThreadValues = async (
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

const isInterruptedResult = (result: unknown): boolean => {
  if (!result || typeof result !== "object") {
    return false;
  }
  const rawInterrupt = (result as Record<string, unknown>).__interrupt__;
  return Array.isArray(rawInterrupt) && rawInterrupt.length > 0;
};

/**
 * Registers LangGraph-style thread and run endpoints.
 */
export const registerThreadRunRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  const { threadRepository, checkpointer, llm } = services;

  app.get("/health", async (_request, reply) => {
    return reply.send({ status: "ok" });
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

      if (
        !Number.isFinite(offset) ||
        !Number.isInteger(offset) ||
        offset < 0
      ) {
        return reply.status(400).send({
          error: "BadRequest",
          message: "offset must be a non-negative integer",
        });
      }

      let status: ValidThreadStatus | undefined;
      if (typeof query.status === "string" && query.status.length > 0) {
        if (
          !validThreadStatuses.includes(query.status as ValidThreadStatus)
        ) {
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

  app.post("/threads", async (request, reply) => {
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
    });

  app.get("/threads/:thread_id", async (request, reply) => {
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
    });

  app.get("/threads/:thread_id/state", async (request, reply) => {
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

        const values = parseCheckpointValues(tuple);
        const tupleConfig =
          tuple && typeof tuple === "object"
            ? ((tuple as unknown as Record<string, unknown>).config as
                | Record<string, unknown>
                | undefined)
            : undefined;
        const metadata =
          tuple && typeof tuple === "object"
            ? ((tuple as unknown as Record<string, unknown>).metadata as
                | Record<string, unknown>
                | undefined)
            : undefined;

        return reply.send({
          values,
          next: [],
          tasks: [],
          metadata: metadata ?? {},
          config: tupleConfig ?? { configurable: { thread_id: threadId } },
          checkpoint: {
            thread_id: threadId,
            checkpoint_id:
              typeof tupleConfig?.configurable === "object"
                ? (
                    tupleConfig.configurable as Record<string, unknown>
                  ).checkpoint_id
                : undefined,
            checkpoint_ns:
              typeof tupleConfig?.configurable === "object"
                ? (
                    tupleConfig.configurable as Record<string, unknown>
                  ).checkpoint_ns
                : undefined,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve state";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    });

  app.get("/threads/:thread_id/history", async (request, reply) => {
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

        const states: Record<string, unknown>[] = [];
        const limitRaw = (request.query as { limit?: string })?.limit;
        const limit =
          typeof limitRaw === "string" && Number.isFinite(Number(limitRaw))
            ? Number(limitRaw)
            : 10;

        try {
          const iterator = checkpointer.list(
            {
              configurable: { thread_id: threadId },
            } as RunnableConfig,
            { limit },
          );

          for await (const tuple of iterator) {
            const tupleAny = tuple as unknown as Record<string, unknown>;
            const tupleConfig =
              (tupleAny.config as Record<string, unknown> | undefined) ?? {};
            states.push({
              values: parseCheckpointValues(tuple),
              next: [],
              tasks: [],
              metadata:
                (tupleAny.metadata as Record<string, unknown> | undefined) ?? {},
              config: tupleConfig,
              checkpoint: {
                thread_id: threadId,
                checkpoint_id:
                  typeof tupleConfig.configurable === "object"
                    ? (tupleConfig.configurable as Record<string, unknown>)
                        .checkpoint_id
                    : undefined,
                checkpoint_ns:
                  typeof tupleConfig.configurable === "object"
                    ? (tupleConfig.configurable as Record<string, unknown>)
                        .checkpoint_ns
                    : undefined,
              },
            });
          }
        } catch {
          return reply.send([]);
        }

        return reply.send(states);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to retrieve history";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    });

  app.post("/threads/:thread_id/runs", async (request, reply) => {
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

        const run = createRun(threadId, body.assistant_id, body.metadata ?? {});
        runs.set(getRunKey(threadId, run.run_id), run);
        setRunStatus(run, "pending");

        void (async () => {
          await updateThreadStatusSafe(threadRepository, threadId, "busy");
          setRunStatus(run, "running");

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
              return;
            }

            setRunStatus(run, "success");
            await updateThreadStatusSafe(threadRepository, threadId, "idle");
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Run execution failed";
            setRunStatus(run, "error", message);
            await updateThreadStatusSafe(threadRepository, threadId, "error");
          }
        })();

        return reply.send(run);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to create run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    });

  app.get("/threads/:thread_id/runs/:run_id", async (request, reply) => {
      const { thread_id: threadId, run_id: runId } = request.params as {
        thread_id: string;
        run_id: string;
      };
      const run = runs.get(getRunKey(threadId, runId));
      if (!run) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Run not found",
        });
      }
      return reply.send(run);
    });

  app.post("/threads/:thread_id/runs/:run_id/interrupt", async (request, reply) => {
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

        const run =
          runs.get(getRunKey(threadId, runId)) ??
          createRun(threadId, "agent", {});
        run.run_id = runId;
        runs.set(getRunKey(threadId, run.run_id), run);
        setRunStatus(run, "running");
        await updateThreadStatusSafe(threadRepository, threadId, "busy");

        try {
          const graph = createGraph(checkpointer, llm);
          const config = buildRunnableConfig(threadId);
          const result = await graph.invoke(new Command(parsed.command), config);

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
    });

  app.post("/threads/:thread_id/runs/stream", async (request, reply) => {
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

      const run = createRun(threadId, body.assistant_id, body.metadata ?? {});
      setRunStatus(run, "running");
      runs.set(getRunKey(threadId, run.run_id), run);
      await updateThreadStatusSafe(threadRepository, threadId, "busy");

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let eventId = 1;
      const streamModes = normalizeStreamModes(body.stream_mode);
      const streamSubgraphs = Boolean(body.stream_subgraphs);
      let interrupted = false;

      try {
        writeSSE(reply, eventId++, "metadata", {
          run_id: run.run_id,
          thread_id: threadId,
          assistant_id: body.assistant_id,
        });

        const graph = createGraph(checkpointer, llm);
        const config = {
          ...buildRunnableConfig(threadId, body.config),
          version: "v2" as const,
          streamSubgraphs,
        };
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});

        const stream = await graph.streamEvents(invokeInput, config);

        for await (const rawEvent of stream) {
          const event = rawEvent as Record<string, unknown>;
          const eventName = event.event as string;

          if (hasStreamMode(streamModes, "events")) {
            const serializedEvent = toSerializable(event);
            writeSSE(reply, eventId++, "events", {
              run_id: run.run_id,
              event:
                serializedEvent && typeof serializedEvent === "object"
                  ? serializedEvent
                  : { value: serializedEvent },
            });
          }

          if (eventName === "__interrupt__") {
            interrupted = true;
            const interruptData = toSerializable(event.data);

            if (hasStreamMode(streamModes, "updates")) {
              writeSSE(reply, eventId++, "updates", {
                __interrupt__: interruptData,
              });
            }

            writeSSE(reply, eventId++, "interrupts", interruptData);
            break;
          }

          if (eventName === "on_chain_end") {
            const data = (event.data as Record<string, unknown> | undefined) ?? {};
            const output = data.output;
            if (output && typeof output === "object") {
              const serializedOutput = toSerializable(output);

              if (hasStreamMode(streamModes, "values")) {
                writeSSE(reply, eventId++, "values", serializedOutput);
              }
              if (hasStreamMode(streamModes, "updates")) {
                writeSSE(reply, eventId++, "updates", serializedOutput);
              }
            }
          }

          if (
            eventName === "on_chat_model_stream" &&
            (hasStreamMode(streamModes, "messages") ||
              hasStreamMode(streamModes, "messages-tuple"))
          ) {
            const data = (event.data as Record<string, unknown> | undefined) ?? {};
            const chunk = (data.chunk as Record<string, unknown> | undefined) ?? {};
            if (chunk.content) {
              const messageChunk = {
                type: "ai",
                content: chunk.content,
              };
              if (hasStreamMode(streamModes, "messages")) {
                writeSSE(reply, eventId++, "messages", [messageChunk]);
              }
              if (hasStreamMode(streamModes, "messages-tuple")) {
                writeSSE(reply, eventId++, "messages-tuple", [
                  messageChunk,
                  {
                    run_id: run.run_id,
                    name: event.name,
                    metadata: event.metadata,
                    tags: event.tags,
                  },
                ]);
              }
            }
          }

          if (
            eventName === "on_tool_start" ||
            eventName === "on_tool_end" ||
            eventName === "on_tool_error"
          ) {
            if (hasStreamMode(streamModes, "tasks")) {
              writeSSE(reply, eventId++, "tasks", {
                id:
                  typeof event.run_id === "string"
                    ? event.run_id
                    : `${run.run_id}:${eventId}`,
                name: event.name,
                status:
                  eventName === "on_tool_start"
                    ? "running"
                    : eventName === "on_tool_end"
                      ? "completed"
                      : "error",
                event: eventName,
                data: toSerializable(event.data),
              });
            }
          }
        }

        const finalValues = await loadThreadValues(checkpointer, threadId);
        if (hasStreamMode(streamModes, "checkpoints")) {
          writeSSE(reply, eventId++, "checkpoints", {
            values: finalValues,
          });
        }

        setRunStatus(run, interrupted ? "interrupted" : "success");
        await updateThreadStatusSafe(
          threadRepository,
          threadId,
          interrupted ? "interrupted" : "idle",
        );
        writeSSE(reply, eventId++, "end", {});
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Streaming run failed";
        setRunStatus(run, "error", message);
        await updateThreadStatusSafe(threadRepository, threadId, "error");
        writeSSE(reply, eventId++, "error", {
          error: "StreamError",
          message,
        });
        writeSSE(reply, eventId++, "end", {});
      } finally {
        reply.raw.end();
      }
    });
};
