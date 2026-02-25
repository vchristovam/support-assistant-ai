import type { FastifyInstance } from "fastify";
import type { ThreadRunServices } from "./types.js";
import { registerAssistantRoutes } from "./routes/assistantRoutes.js";
import { registerStatelessRunRoutes } from "./routes/statelessRunRoutes.js";
import { registerSystemRoutes } from "./routes/systemRoutes.js";
import { registerThreadRoutes } from "./routes/threadRoutes.js";
import { registerThreadRunRoutes } from "./routes/threadRunRoutes.js";
import { registerThreadStateRoutes } from "./routes/threadStateRoutes.js";

/**
 * Registers LangGraph-style thread and run endpoints.
 */
export const registerLangGraphRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  registerSystemRoutes(app);
  registerAssistantRoutes(app);
  registerThreadRoutes(app, services);
  registerThreadStateRoutes(app, services);
  registerThreadRunRoutes(app, services);
  registerStatelessRunRoutes(app, services);
};
