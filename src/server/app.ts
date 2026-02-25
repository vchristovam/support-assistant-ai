import Fastify from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { config } from "../config/index.js";
import { initializeInfrastructure } from "./infrastructure.js";
import { registerAuthHook } from "./middleware/auth.js";
import { registerTelemetry } from "./middleware/telemetry.js";
import { registerThreadRunRoutes } from "./threadRuns.js";

export const createApp = async (llm?: BaseChatModel) => {
  const app = Fastify({ logger: true });

  // Initialize infrastructure (checkpointer, SQL pool, repositories)
  const { checkpointer, threadRepository } = await initializeInfrastructure();

  // Register authentication and telemetry middleware
  registerAuthHook(app);
  registerTelemetry(app);

  registerThreadRunRoutes(app, {
    threadRepository,
    checkpointer,
    llm,
  });

  return app;
};

export const startServer = async (port = config.app.port) => {
  const app = await createApp();
  await app.listen({ port });
  return app;
};
