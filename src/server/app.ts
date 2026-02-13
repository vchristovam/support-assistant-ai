import Fastify from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "../config/index.js";
import { swaggerConfig, swaggerUiConfig } from "./swagger.js";
import { initializeInfrastructure } from "./infrastructure.js";
import { registerAuthHook } from "./middleware/auth.js";
import { registerChatRoutes } from "./routes/chat.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerRunRoutes } from "./routes/runs.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerSupportRoutes } from "./routes/support.js";

export const createApp = async (llm?: BaseChatModel) => {
  const app = Fastify({ logger: true });

  // Register Swagger plugins
  await app.register(swagger, swaggerConfig);
  await app.register(swaggerUi, swaggerUiConfig);

  // Initialize infrastructure (checkpointer, SQL pool, repositories)
  const { checkpointer, threadRepository, conversationRepository } =
    await initializeInfrastructure();

  // Register authentication middleware
  registerAuthHook(app);

  // Register routes
  registerHealthRoute(app);
  registerChatRoutes(app, llm, checkpointer);
  registerThreadRoutes(
    app,
    threadRepository,
    conversationRepository,
    checkpointer,
  );
  registerRunRoutes(app, llm, threadRepository, checkpointer);
  registerSupportRoutes(app, llm, checkpointer);

  return app;
};

export const startServer = async (port = config.app.port) => {
  const app = await createApp();
  await app.listen({ port });
  return app;
};
