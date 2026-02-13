import type { FastifyInstance } from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Command } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ThreadRepository } from "../../repositories/threadRepository.js";
import {
  createRun,
  getRun,
  cancelRun,
  type CreateRunRequest,
} from "../runs.js";
import { getThread } from "../threads.js";
import { streamRunEvents } from "../stream.js";
import { routeSchemas } from "../swagger.js";

export const registerRunRoutes = (
  app: FastifyInstance,
  llm: BaseChatModel | undefined,
  threadRepository: ThreadRepository | undefined,
  checkpointer: BaseCheckpointSaver,
) => {
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
          await import("../../agents/supervisor/index.js");
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
};
