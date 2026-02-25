import type { FastifyInstance } from "fastify";

/**
 * Simple telemetry middleware - logs all requests to console.error
 * This can be replaced with a proper telemetry service later
 */
export const registerTelemetry = (app: FastifyInstance): void => {
  app.addHook("onResponse", async (request, reply) => {
    const method = request.method;
    const path = request.url;
    const statusCode = reply.statusCode;
    const duration = reply.elapsedTime;

    console.error(`${method} ${path} ${statusCode} ${duration.toFixed(2)}ms`);
  });
};
