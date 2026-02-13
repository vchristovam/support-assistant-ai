import Fastify from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MemorySaver, Command } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import sql from "mssql";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  createRedisCheckpointer,
  createSqlServerCheckpointer,
} from "../graph/index.js";
import type { SqlServerConfig } from "../checkpointer/sqlserver.js";
import {
  streamChatEvents,
  streamResumeEvents,
  streamRunEvents,
} from "./stream.js";
import { config } from "../config/index.js";
import { createThread, getThread, getThreadHistory } from "./threads.js";
import { createRun, getRun, cancelRun, type CreateRunRequest } from "./runs.js";
import { ThreadRepository } from "../repositories/threadRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";
import { swaggerConfig, swaggerUiConfig, routeSchemas } from "./swagger.js";
import { registerSupportRoutes } from "./routes/support.js";

export const createApp = async (llm?: BaseChatModel) => {
  const app = Fastify({ logger: true });

  // Register Swagger plugins
  await app.register(swagger, swaggerConfig);
  await app.register(swaggerUi, swaggerUiConfig);

  // Initialize checkpointer: SQL Server if configured, then Redis, otherwise MemorySaver
  let checkpointer: BaseCheckpointSaver;
  try {
    if (
      config.sqlServer.server &&
      config.sqlServer.database &&
      config.sqlServer.user &&
      config.sqlServer.password
    ) {
      checkpointer = await createSqlServerCheckpointer(
        config.sqlServer as SqlServerConfig,
      );
      console.log("Connected to SQL Server for state persistence");
    } else if (config.redis.url) {
      checkpointer = await createRedisCheckpointer(config.redis.url);
      console.log("Connected to Redis for state persistence");
    } else {
      checkpointer = new MemorySaver();
      console.log(
        "Using MemorySaver for state persistence (no SQL Server or Redis configured)",
      );
    }
  } catch (error) {
    console.error(
      "Failed to initialize checkpointer, falling back to MemorySaver:",
      error,
    );
    checkpointer = new MemorySaver();
  }

  // Initialize SQL Server connection pool and repositories
  let threadRepository: ThreadRepository | undefined;
  let conversationRepository: ConversationRepository | undefined;
  let sqlPool: sql.ConnectionPool | undefined;

  try {
    const sqlConfig = config.sqlServer;
    if (
      sqlConfig.server &&
      sqlConfig.database &&
      sqlConfig.user &&
      sqlConfig.password
    ) {
      sqlPool = await sql.connect({
        server: sqlConfig.server,
        port: sqlConfig.port,
        database: sqlConfig.database,
        user: sqlConfig.user,
        password: sqlConfig.password,
        options: {
          encrypt: sqlConfig.options.encrypt,
          trustServerCertificate: sqlConfig.options.trustServerCertificate,
        },
        pool: {
          min: 0,
          max: 10,
        },
      });
      threadRepository = new ThreadRepository(sqlPool);
      conversationRepository = new ConversationRepository(sqlPool);
      console.log("Connected to SQL Server for thread persistence");
    } else {
      console.log(
        "SQL Server not configured, using in-memory fallback for thread metadata",
      );
    }
  } catch (error) {
    console.error(
      "Failed to initialize SQL Server connection, using fallback:",
      error,
    );
  }

  app.addHook("preHandler", async (request, _reply) => {
    // Skip auth for health check
    if (request.url === "/health") {
      return;
    }

    // Extract user_id from JWT token or custom header
    const authHeader = request.headers.authorization;
    const userIdHeader = request.headers["x-user-id"] as string | undefined;

    if (userIdHeader) {
      // Use provided user ID from header (for testing or internal use)
      (request as unknown as Record<string, unknown>).user = {
        user_id: userIdHeader,
      };
      return;
    }

    if (authHeader?.startsWith("Bearer ")) {
      // In a real implementation, verify JWT here
      // For now, extract a mock user_id from the token for development
      const token = authHeader.substring(7);
      try {
        // Simple mock: use token as user_id if it looks like a UUID
        // In production, use a proper JWT library like jsonwebtoken
        if (token.length > 10) {
          (request as unknown as Record<string, unknown>).user = {
            user_id: `user-${token.substring(0, 8)}`,
          };
          return;
        }
      } catch {
        // Invalid token, fall through to default
      }
    }

    // Default: assign anonymous user for backward compatibility
    // In production, you may want to reject the request instead
    (request as unknown as Record<string, unknown>).user = {
      user_id: "anonymous",
    };
  });

  app.get("/health", routeSchemas.health, async () => ({ status: "ok" }));

  app.post("/chat", routeSchemas.chat, async (request, reply) => {
    const { message, thread_id } = request.body as {
      message: string;
      thread_id?: string;
    };

    if (!message) {
      reply.status(400);
      return { error: "Message is required" };
    }

    const threadId = thread_id || `thread-${Date.now()}`;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const chunk of streamChatEvents(
        message,
        threadId,
        checkpointer,
        llm,
      )) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (error) {
      reply.raw.write(
        `data: ${JSON.stringify({ error: (error as Error).message })}\n\n`,
      );
      reply.raw.end();
    }
    return;
  });

  app.post("/chat/resume", routeSchemas.chatResume, async (request, reply) => {
    const { thread_id, decision, edited_action } = request.body as {
      thread_id?: string;
      decision?: string;
      edited_action?: object;
    };

    const validDecisions = ["approve", "reject", "edit"];

    if (!thread_id || !decision || !validDecisions.includes(decision)) {
      reply.status(400);
      return { error: "Missing required fields" };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const chunk of streamResumeEvents(
        thread_id,
        decision,
        edited_action,
        checkpointer,
        llm,
      )) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (error) {
      reply.raw.write(
        `data: ${JSON.stringify({ error: (error as Error).message })}\n\n`,
      );
      reply.raw.end();
    }
    return;
  });

  app.post("/chat/answer", routeSchemas.chatAnswer, async (request, reply) => {
    const { thread_id, answer } = request.body as {
      thread_id?: string;
      answer?: string;
    };

    if (!thread_id || !answer) {
      reply.status(400);
      return { error: "Missing required fields" };
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const { createSupportSupervisor } =
        await import("../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm!, checkpointer);

      for await (const chunk of await graph.stream(
        new Command({ resume: answer }),
        { configurable: { thread_id } },
      )) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
    } catch (error) {
      reply.raw.write(
        `data: ${JSON.stringify({ error: (error as Error).message })}\n\n`,
      );
      reply.raw.end();
    }
    return;
  });

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

  app.post(
    "/api/threads/:thread_id/runs",
    routeSchemas.createRun,
    async (request, reply) => {
      const { thread_id } = request.params as { thread_id: string };
      const user = (request as unknown as Record<string, unknown>).user as
        | { user_id: string }
        | undefined;
      const userId = user?.user_id ?? "anonymous";

      try {
        const body = request.body as {
          assistant_id: string;
          input?: {
            messages?: Array<{
              type: string;
              content: string;
              tool_call_id?: string;
            }>;
          } | null;
          metadata?: Record<string, unknown>;
          config?: {
            tags?: string[];
            recursion_limit?: number;
            configurable?: Record<string, unknown>;
          };
          streamMode?: Array<
            "values" | "messages" | "events" | "updates" | "debug" | "custom"
          >;
          interruptBefore?: string[];
          interruptAfter?: string[];
          command?: {
            resume?: unknown;
            update?: unknown;
            goto?: string | string[];
          };
        };

        if (!body.assistant_id) {
          reply.status(400);
          return { error: "BadRequest", message: "assistant_id is required" };
        }

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
        }

        const run = await createRun(
          thread_id,
          body as CreateRunRequest,
          checkpointer,
          llm,
          threadRepository,
        );

        return run;
      } catch (error) {
        reply.status(500);
        return { error: "InternalError", message: (error as Error).message };
      }
    },
  );

  app.get(
    "/api/threads/:thread_id/runs/:run_id",
    routeSchemas.getRun,
    async (request, reply) => {
      const { thread_id, run_id } = request.params as {
        thread_id: string;
        run_id: string;
      };

      try {
        const run = await getRun(thread_id, run_id);

        if (!run) {
          reply.status(404);
          return { error: "NotFound", message: `Run '${run_id}' not found` };
        }

        return run;
      } catch (error) {
        reply.status(500);
        return { error: "InternalError", message: (error as Error).message };
      }
    },
  );

  app.post(
    "/api/threads/:thread_id/runs/:run_id/cancel",
    routeSchemas.cancelRun,
    async (request, reply) => {
      const { thread_id, run_id } = request.params as {
        thread_id: string;
        run_id: string;
      };

      try {
        const cancelled = await cancelRun(thread_id, run_id);

        if (!cancelled) {
          reply.status(404);
          return {
            error: "NotFound",
            message: `Run '${run_id}' not found or already complete`,
          };
        }

        return { success: true };
      } catch (error) {
        reply.status(500);
        return { error: "InternalError", message: (error as Error).message };
      }
    },
  );

  app.get(
    "/api/threads/:thread_id/runs/:run_id/stream",
    routeSchemas.streamRun,
    async (request, reply) => {
      const { thread_id, run_id } = request.params as {
        thread_id: string;
        run_id: string;
      };
      const user = (request as unknown as Record<string, unknown>).user as
        | { user_id: string }
        | undefined;
      const userId = user?.user_id ?? "anonymous";

      const lastEventId = request.headers["last-event-id"] as
        | string
        | undefined;

      try {
        const run = await getRun(thread_id, run_id);
        if (!run) {
          reply.status(404);
          return { error: "NotFound", message: `Run '${run_id}' not found` };
        }

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        let messages: Array<{ type: string; content: string }> | undefined;
        if (threadRepository) {
          const thread = await getThread(
            thread_id,
            threadRepository,
            userId,
            checkpointer,
          );
          messages = thread?.values?.messages as
            | Array<{ type: string; content: string }>
            | undefined;
        }

        const streamOptions = {
          streamMode: ["values", "messages", "events"] as Array<
            "values" | "messages" | "events"
          >,
          lastEventId,
        };

        for await (const chunk of streamRunEvents(
          thread_id,
          run_id,
          messages ? { messages } : null,
          checkpointer,
          streamOptions,
          llm,
        )) {
          reply.raw.write(chunk);
        }
        reply.raw.end();
      } catch (error) {
        console.error(
          `Error streaming run ${run_id} for thread ${thread_id}:`,
          error,
        );
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({
            error: "InternalError",
            message: (error as Error).message,
          })}\n\n`,
        );
        reply.raw.write(`event: end\ndata: {}\n\n`);
        reply.raw.end();
      }
      return;
    },
  );

  app.post(
    "/api/threads/:thread_id/runs/:run_id/interrupt",
    routeSchemas.interruptResume,
    async (request, reply) => {
      const { thread_id, run_id } = request.params as {
        thread_id: string;
        run_id: string;
      };

      const body = request.body as {
        action?: string;
        value?: unknown;
      };

      const validActions = ["accept", "reject", "edit"];

      if (!body.action || !validActions.includes(body.action)) {
        reply.status(400);
        return {
          error: "BadRequest",
          message:
            "Invalid or missing action. Must be: accept, reject, or edit",
        };
      }

      try {
        const run = await getRun(thread_id, run_id);
        if (!run) {
          reply.status(404);
          return {
            error: "NotFound",
            message: `Run '${run_id}' not found`,
          };
        }

        if (run.status !== "interrupted") {
          reply.status(409);
          return {
            error: "Conflict",
            message: `Run is not in interrupted state (current: ${run.status})`,
          };
        }

        const { createSupportSupervisor } =
          await import("../agents/supervisor/index.js");
        const graph = createSupportSupervisor(llm!, checkpointer);

        const commandResume = {
          decision: body.action,
          ...(body.action === "edit" && body.value
            ? { editedAction: body.value }
            : {}),
        };

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        for await (const chunk of await graph.stream(
          new Command({ resume: commandResume }),
          { configurable: { thread_id } },
        )) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();
      } catch (error) {
        console.error(
          `Error resuming from interrupt for run ${run_id} in thread ${thread_id}:`,
          error,
        );
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({
            error: "InternalError",
            message: (error as Error).message,
          })}\n\n`,
        );
        reply.raw.write(`event: end\ndata: {}\n\n`);
        reply.raw.end();
      }
      return;
    },
  );

  registerSupportRoutes(app, llm, checkpointer);

  return app;
};

export const startServer = async (port = config.app.port) => {
  const app = await createApp();
  await app.listen({ port });
  return app;
};
