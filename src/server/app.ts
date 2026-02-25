import Fastify from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { config } from "../config/index.js";
import { registerOpenApiDocs } from "./docs.js";
import { initializeInfrastructure } from "./infrastructure.js";
import { registerAuthHook } from "./middleware/auth.js";
import { registerCorsHook } from "./middleware/cors.js";
import { registerTelemetryHook } from "./middleware/telemetry.js";
import { registerThreadRunRoutes } from "./threadRuns.js";

export const createApp = async (llm?: BaseChatModel) => {
  const app = Fastify({ logger: true });

  // Initialize infrastructure (checkpointer, SQL pool, repositories)
  const { checkpointer, threadRepository } = await initializeInfrastructure();

  // Register CORS before other middleware so OPTIONS preflight is handled early.
  registerCorsHook(app);

  // Register authentication and telemetry middleware
  registerAuthHook(app);
  registerTelemetryHook(app);

  // Register OpenAPI/Swagger documentation routes.
  await registerOpenApiDocs(app);

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
