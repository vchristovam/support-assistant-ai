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
  | "interrupted"
  | "timeout";

const validThreadStatuses = ["idle", "busy", "interrupted", "error"] as const;
type ValidThreadStatus = (typeof validThreadStatuses)[number];
const validRunStatuses = [
  "pending",
  "running",
  "success",
  "error",
  "interrupted",
  "timeout",
] as const;
type ValidRunStatus = (typeof validRunStatuses)[number];

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
  stream_resumable?: boolean;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
  multitask_strategy?: "reject" | "interrupt" | "rollback" | "enqueue";
  on_disconnect?: "cancel" | "continue";
  checkpoint?: Record<string, unknown>;
  checkpoint_id?: string;
  durability?: "sync" | "async" | "exit";
  signal?: AbortSignal;
}

interface SearchThreadsBody {
  metadata?: Record<string, unknown>;
  ids?: string[];
  limit?: number;
  offset?: number;
  status?: string;
  values?: Record<string, unknown>;
}

interface CountThreadsBody {
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
  status?: string;
}

interface SearchRunsQuery {
  limit?: string | number;
  offset?: string | number;
  status?: string;
}

interface SearchRunsBody {
  limit?: number;
  offset?: number;
  status?: string;
}

interface CancelRunQuery {
  wait?: string | number;
  action?: "interrupt" | "rollback";
}

interface ThreadPatchBody {
  metadata?: Record<string, unknown>;
  ttl?: unknown;
}

interface ThreadStateCheckpointBody {
  checkpoint?: Record<string, unknown>;
  subgraphs?: boolean;
}

interface ThreadStateUpdateBody {
  values?: Record<string, unknown>;
  checkpoint_id?: string;
  checkpoint?: Record<string, unknown>;
  as_node?: string;
}

interface ThreadStatePatchBody {
  metadata?: Record<string, unknown>;
}

interface ThreadHistoryBody {
  limit?: number;
  before?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
}

interface AssistantSearchBody {
  graph_id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

interface StreamEventRecord {
  id: number;
  event: string;
  data: unknown;
}

interface RunStreamRecord {
  nextEventId: number;
  events: StreamEventRecord[];
  listeners: Set<FastifyReply>;
  completed: boolean;
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
const runsById = new Map<string, RunRecord>();
const runAbortControllers = new Map<string, AbortController>();
const runStreams = new Map<string, RunStreamRecord>();
const STATELESS_THREAD_ID = "__stateless__";

const getRunKey = (threadId: string, runId: string): string =>
  `${threadId}:${runId}`;
const getStatelessRunKey = (runId: string): string =>
  getRunKey(STATELESS_THREAD_ID, runId);

const isFinalRunStatus = (status: RunStatus): boolean =>
  status === "success" ||
  status === "error" ||
  status === "interrupted" ||
  status === "timeout";

const toPositiveInt = (
  value: string | number | undefined,
  fallback: number,
): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return fallback;
};

const matchesRecord = (
  filter: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
): boolean => {
  if (!filter) {
    return true;
  }
  for (const [key, value] of Object.entries(filter)) {
    if (candidate[key] !== value) {
      return false;
    }
  }
  return true;
};

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
  runsById.set(run.run_id, run);
  return run;
};

const registerRun = (run: RunRecord): RunRecord => {
  runs.set(getRunKey(run.thread_id, run.run_id), run);
  runsById.set(run.run_id, run);
  return run;
};

const getRunRecord = (
  threadId: string | undefined,
  runId: string,
): RunRecord | undefined => {
  if (threadId) {
    return runs.get(getRunKey(threadId, runId));
  }
  return runsById.get(runId);
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

const getOrCreateRunStream = (runKey: string): RunStreamRecord => {
  const existing = runStreams.get(runKey);
  if (existing) {
    return existing;
  }
  const created: RunStreamRecord = {
    nextEventId: 1,
    events: [],
    listeners: new Set(),
    completed: false,
  };
  runStreams.set(runKey, created);
  return created;
};

const resetRunStream = (runKey: string): RunStreamRecord => {
  const stream = getOrCreateRunStream(runKey);
  stream.nextEventId = 1;
  stream.events = [];
  stream.completed = false;
  for (const listener of stream.listeners) {
    if (!listener.raw.writableEnded) {
      listener.raw.end();
    }
  }
  stream.listeners.clear();
  return stream;
};

const setupSSEHeaders = (
  reply: FastifyReply,
  extraHeaders?: Record<string, string>,
): void => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...extraHeaders,
  });
};

const emitRunStreamEvent = (
  runKey: string,
  event: string,
  data: unknown,
): void => {
  const stream = getOrCreateRunStream(runKey);
  const eventRecord: StreamEventRecord = {
    id: stream.nextEventId++,
    event,
    data,
  };
  stream.events.push(eventRecord);

  for (const listener of stream.listeners) {
    if (listener.raw.writableEnded) {
      stream.listeners.delete(listener);
      continue;
    }
    try {
      writeSSE(listener, eventRecord.id, eventRecord.event, eventRecord.data);
    } catch {
      stream.listeners.delete(listener);
    }
  }
};

const completeRunStream = (runKey: string): void => {
  const stream = getOrCreateRunStream(runKey);
  stream.completed = true;
  for (const listener of stream.listeners) {
    if (!listener.raw.writableEnded) {
      listener.raw.end();
    }
  }
  stream.listeners.clear();
};

const attachRunStreamListener = (
  runKey: string,
  reply: FastifyReply,
  afterEventId: number,
  extraHeaders?: Record<string, string>,
): void => {
  const stream = getOrCreateRunStream(runKey);
  setupSSEHeaders(reply, extraHeaders);

  for (const eventRecord of stream.events) {
    if (eventRecord.id <= afterEventId) {
      continue;
    }
    writeSSE(reply, eventRecord.id, eventRecord.event, eventRecord.data);
  }

  if (stream.completed) {
    reply.raw.end();
    return;
  }

  stream.listeners.add(reply);
  const cleanup = () => {
    stream.listeners.delete(reply);
  };
  reply.raw.on("close", cleanup);
  reply.raw.on("error", cleanup);
};

const getLastEventId = (request: unknown): number => {
  const headers = (request as { headers?: Record<string, unknown> }).headers;
  const raw = headers?.["last-event-id"];
  if (typeof raw !== "string") {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
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

const buildStateResponseFromTuple = (
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

const loadThreadHistory = async (
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

const isInterruptedResult = (result: unknown): boolean => {
  if (!result || typeof result !== "object") {
    return false;
  }
  const rawInterrupt = (result as Record<string, unknown>).__interrupt__;
  return Array.isArray(rawInterrupt) && rawInterrupt.length > 0;
};

const listRunsByThread = (
  threadId: string,
  options: SearchRunsBody = {},
): RunRecord[] => {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const status =
    typeof options.status === "string" &&
    validRunStatuses.includes(options.status as ValidRunStatus)
      ? (options.status as ValidRunStatus)
      : undefined;

  const filtered = Array.from(runs.values())
    .filter((run) => run.thread_id === threadId)
    .filter((run) => (status ? run.status === status : true))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return filtered.slice(offset, offset + limit);
};

const waitForRunCompletion = async (
  run: RunRecord,
  timeoutMs = 60_000,
): Promise<RunRecord> => {
  if (isFinalRunStatus(run.status)) {
    return run;
  }

  const runKey = getRunKey(run.thread_id, run.run_id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const latest = runs.get(runKey) ?? run;
    if (isFinalRunStatus(latest.status)) {
      return latest;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  return setRunStatus(run, "timeout", "Run join timeout");
};

const createAssistantRecord = (
  assistantId: string,
  graphId: string,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> => {
  const now = getIsoNow();
  return {
    assistant_id: assistantId,
    graph_id: graphId,
    config: {},
    context: {},
    metadata,
    version: 1,
    created_at: now,
    updated_at: now,
    name: assistantId,
    description: null,
  };
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

  app.get("/info", async (_request, reply) => {
    return reply.send({
      version: "0.1.0",
      langgraph_js_version: "1.x",
      langgraph_py_version: null,
      flags: {
        assistive_ui: false,
        subgraphs: true,
        threads: true,
        runs: true,
      },
    });
  });

  app.post("/assistants/search", async (request, reply) => {
    const body = (request.body || {}) as AssistantSearchBody;
    const assistants = [
      createAssistantRecord("agent", "agent"),
      createAssistantRecord("support-agent", "support-agent"),
    ];

    const filtered = assistants
      .filter((assistant) =>
        body.graph_id ? assistant.graph_id === body.graph_id : true,
      )
      .filter((assistant) =>
        body.name
          ? typeof assistant.name === "string" &&
            assistant.name.toLowerCase().includes(body.name.toLowerCase())
          : true,
      )
      .filter((assistant) =>
        matchesRecord(
          body.metadata,
          (assistant.metadata as Record<string, unknown>) ?? {},
        ),
      );

    const offset = Math.max(0, body.offset ?? 0);
    const limit = Math.max(1, body.limit ?? 10);
    return reply.send(filtered.slice(offset, offset + limit));
  });

  app.get("/assistants/:assistant_id", async (request, reply) => {
    const { assistant_id: assistantId } = request.params as {
      assistant_id: string;
    };
    return reply.send(createAssistantRecord(assistantId, assistantId));
  });

  app.get("/assistants/:assistant_id/graph", async (_request, reply) => {
    return reply.send({
      nodes: [],
      edges: [],
    });
  });

  app.get("/assistants/:assistant_id/schemas", async (_request, reply) => {
    return reply.send({
      state_schema: {},
      config_schema: {},
    });
  });

  app.get("/assistants/:assistant_id/subgraphs", async (_request, reply) => {
    return reply.send({});
  });

  app.get(
    "/assistants/:assistant_id/subgraphs/:namespace",
    async (_request, reply) => {
      return reply.send({});
    },
  );

  app.post("/threads/search", async (request, reply) => {
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
  });

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

  app.get("/threads/:thread_id/state/:checkpoint_id", async (request, reply) => {
      try {
        const userId = getUserId(request);
        const { thread_id: threadId, checkpoint_id: checkpointId } =
          request.params as { thread_id: string; checkpoint_id: string };
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
    });

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

        const limit = Math.max(
          1,
          toPositiveInt((request.query as { limit?: string })?.limit, 10),
        );
        const states = await loadThreadHistory(checkpointer, threadId, limit).catch(
          () => [],
        );
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

  app.post("/threads/:thread_id/history", async (request, reply) => {
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
        const states = await loadThreadHistory(checkpointer, threadId, limit).catch(
          () => [],
        );
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
        registerRun(run);
        setRunStatus(run, "pending");

        void (async () => {
          await updateThreadStatusSafe(threadRepository, threadId, "busy");
          setRunStatus(run, "running");
          const runKey = getRunKey(threadId, run.run_id);
          const abortController = new AbortController();
          runAbortControllers.set(runKey, abortController);

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
            runAbortControllers.delete(runKey);
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
    });

  app.get("/threads/:thread_id/runs", async (request, reply) => {
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
        if (
          status &&
          !validRunStatuses.includes(status as ValidRunStatus)
        ) {
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
    });

  app.get("/threads/:thread_id/runs/:run_id", async (request, reply) => {
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
      const run = runs.get(getRunKey(threadId, runId));
      if (!run) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Run not found",
        });
      }
      return reply.send(run);
    });

  app.post("/threads/:thread_id/runs/:run_id/cancel", async (request, reply) => {
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

        const run = runs.get(getRunKey(threadId, runId));
        if (!run) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Run not found",
          });
        }

        const runKey = getRunKey(threadId, runId);
        runAbortControllers.get(runKey)?.abort();
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
    });

  app.get("/threads/:thread_id/runs/:run_id/join", async (request, reply) => {
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

        const run = runs.get(getRunKey(threadId, runId));
        if (!run) {
          return reply.status(404).send({
            error: "NotFound",
            message: "Run not found",
          });
        }

        const completed = await waitForRunCompletion(run);
        return reply.send(completed);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to join run";
        return reply.status(500).send({
          error: "InternalError",
          message,
        });
      }
    });

  app.get("/threads/:thread_id/runs/:run_id/stream", async (request, reply) => {
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

      const run = runs.get(getRunKey(threadId, runId));
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
          const current = runs.get(runKey);
          if (!current || isFinalRunStatus(current.status)) {
            return;
          }
          runAbortControllers.get(runKey)?.abort();
          setRunStatus(current, "interrupted", "Client disconnected");
          await updateThreadStatusSafe(threadRepository, threadId, "interrupted");
        });
      }
    });

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
      const run = runs.get(runKey);
      if (!run) {
        return reply.status(404).send({
          error: "NotFound",
          message: "Run not found",
        });
      }

      runAbortControllers.get(runKey)?.abort();
      runAbortControllers.delete(runKey);
      runs.delete(runKey);
      runsById.delete(runId);
      runStreams.delete(runKey);

      return reply.status(204).send();
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
      const runKey = getRunKey(threadId, run.run_id);
      registerRun(run);
      setRunStatus(run, "running");
      resetRunStream(runKey);
      attachRunStreamListener(runKey, reply, 0, {
        "Content-Location": `/threads/${threadId}/runs/${run.run_id}`,
      });
      await updateThreadStatusSafe(threadRepository, threadId, "busy");

      const abortController = new AbortController();
      runAbortControllers.set(runKey, abortController);
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

          if (hasStreamMode(streamModes, "events")) {
            const serializedEvent = toSerializable(event);
            emitRunStreamEvent(runKey, "events", {
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
              emitRunStreamEvent(runKey, "updates", {
                __interrupt__: interruptData,
              });
            }

            emitRunStreamEvent(runKey, "interrupts", interruptData);
            break;
          }

          if (eventName === "on_chain_end") {
            const data = (event.data as Record<string, unknown> | undefined) ?? {};
            const output = data.output;
            if (output && typeof output === "object") {
              const serializedOutput = toSerializable(output);

              if (hasStreamMode(streamModes, "values")) {
                emitRunStreamEvent(runKey, "values", serializedOutput);
              }
              if (hasStreamMode(streamModes, "updates")) {
                emitRunStreamEvent(runKey, "updates", serializedOutput);
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
                emitRunStreamEvent(runKey, "messages", [messageChunk]);
              }
              if (hasStreamMode(streamModes, "messages-tuple")) {
                emitRunStreamEvent(runKey, "messages-tuple", [
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
              emitRunStreamEvent(runKey, "tasks", {
                id:
                  typeof event.run_id === "string"
                    ? event.run_id
                    : `${run.run_id}:${Date.now()}`,
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
          emitRunStreamEvent(runKey, "checkpoints", {
            values: finalValues,
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
          await updateThreadStatusSafe(threadRepository, threadId, "interrupted");
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
        runAbortControllers.delete(runKey);
        completeRunStream(runKey);
      }
    });

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

        const run = createRun(threadId, body.assistant_id, body.metadata ?? {});
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
            await updateThreadStatusSafe(threadRepository, threadId, "interrupted");
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

  app.post("/runs/stream", async (request, reply) => {
      const body = (request.body || {}) as RunBody;
      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        return reply.status(400).send({
          error: "BadRequest",
          message: "assistant_id is required",
        });
      }

      const run = createRun(STATELESS_THREAD_ID, body.assistant_id, body.metadata ?? {});
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
          assistant_id: body.assistant_id,
        });

        const graph = createGraph(checkpointer, llm);
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});
        const result = await graph.invoke(invokeInput, body.config as RunnableConfig);

        const serialized = toSerializable(result);
        if (hasStreamMode(streamModes, "values")) {
          emitRunStreamEvent(runKey, "values", serialized);
        }
        if (hasStreamMode(streamModes, "updates")) {
          emitRunStreamEvent(runKey, "updates", serialized);
        }

        setRunStatus(run, isInterruptedResult(result) ? "interrupted" : "success");
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
    });

  app.post("/runs", async (request, reply) => {
      const body = (request.body || {}) as RunBody;
      if (!body.assistant_id || typeof body.assistant_id !== "string") {
        return reply.status(400).send({
          error: "BadRequest",
          message: "assistant_id is required",
        });
      }

      const run = createRun(STATELESS_THREAD_ID, body.assistant_id, body.metadata ?? {});
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
          setRunStatus(run, isInterruptedResult(result) ? "interrupted" : "success");
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

      const run = createRun(STATELESS_THREAD_ID, body.assistant_id, body.metadata ?? {});
      registerRun(run);
      setRunStatus(run, "running");
      try {
        const graph = createGraph(checkpointer, llm);
        const invokeInput = body.command
          ? new Command(body.command)
          : (body.input ?? {});
        const result = await graph.invoke(invokeInput, body.config as RunnableConfig);
        setRunStatus(run, isInterruptedResult(result) ? "interrupted" : "success");
        reply.header("Content-Location", `/runs/${run.run_id}`);
        return reply.send(toSerializable(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Run wait failed";
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
        );
        registerRun(run);
        setRunStatus(run, "pending");
        results.push(run);
      }
      return reply.send(results);
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
