import type { FastifyInstance } from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Command } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { streamChatEvents, streamResumeEvents } from "../stream.js";
import { routeSchemas } from "../swagger.js";

export const registerChatRoutes = (
  app: FastifyInstance,
  llm: BaseChatModel | undefined,
  checkpointer: BaseCheckpointSaver,
) => {
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
        await import("../../agents/supervisor/index.js");
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
};
