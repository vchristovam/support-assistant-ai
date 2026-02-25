import type { FastifyInstance } from "fastify";
import { registerLangGraphRoutes } from "./langgraph/registerRoutes.js";
import type { ThreadRunServices } from "./langgraph/types.js";

/**
 * Registers LangGraph-style thread and run endpoints.
 */
export const registerThreadRunRoutes = (
  app: FastifyInstance,
  services: ThreadRunServices,
): void => {
  registerLangGraphRoutes(app, services);
};

export type { ThreadRunServices } from "./langgraph/types.js";
