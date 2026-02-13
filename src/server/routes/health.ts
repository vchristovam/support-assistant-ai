import type { FastifyInstance } from "fastify";
import { routeSchemas } from "../swagger.js";

export const registerHealthRoute = (app: FastifyInstance) => {
  app.get("/health", routeSchemas.health, async () => ({ status: "ok" }));
};
