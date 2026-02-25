import type { FastifyReply } from "fastify";

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

const runStreams = new Map<string, RunStreamRecord>();

export const writeSSE = (
  reply: FastifyReply,
  id: number,
  event: string,
  data: unknown,
): void => {
  reply.raw.write(`id: ${id}\n`);
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const getOrCreateRunStream = (runKey: string): RunStreamRecord => {
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

export const resetRunStream = (runKey: string): RunStreamRecord => {
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

export const setupSSEHeaders = (
  reply: FastifyReply,
  extraHeaders?: Record<string, string>,
): void => {
  const getHeaderAsString = (name: string): string | undefined => {
    const value = reply.getHeader(name);
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return undefined;
  };

  const corsHeaders: Record<string, string> = {};
  const allowOrigin = getHeaderAsString("Access-Control-Allow-Origin");
  const allowCredentials = getHeaderAsString("Access-Control-Allow-Credentials");
  const exposeHeaders = getHeaderAsString("Access-Control-Expose-Headers");
  const vary = getHeaderAsString("Vary");

  if (allowOrigin) {
    corsHeaders["Access-Control-Allow-Origin"] = allowOrigin;
  }
  if (allowCredentials) {
    corsHeaders["Access-Control-Allow-Credentials"] = allowCredentials;
  }
  if (exposeHeaders) {
    corsHeaders["Access-Control-Expose-Headers"] = exposeHeaders;
  }
  if (vary) {
    corsHeaders.Vary = vary;
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...corsHeaders,
    ...extraHeaders,
  });
};

export const emitRunStreamEvent = (
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

export const completeRunStream = (runKey: string): void => {
  const stream = getOrCreateRunStream(runKey);
  stream.completed = true;
  for (const listener of stream.listeners) {
    if (!listener.raw.writableEnded) {
      listener.raw.end();
    }
  }
  stream.listeners.clear();
};

export const attachRunStreamListener = (
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

export const getLastEventId = (request: unknown): number => {
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

export const deleteRunStream = (runKey: string): void => {
  runStreams.delete(runKey);
};
