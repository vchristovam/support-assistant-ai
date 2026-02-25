import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

/**
 * Registers OpenAPI and Swagger UI documentation routes.
 */
export const registerOpenApiDocs = async (
  app: FastifyInstance,
): Promise<void> => {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Support Assistant API",
        description:
          "LangGraph-compatible thread and run endpoints for useStream/useThread APIs.",
        version: "0.1.0",
      },
      tags: [
        { name: "system", description: "Server/system endpoints" },
        { name: "threads", description: "Thread lifecycle and state endpoints" },
        { name: "runs", description: "Run lifecycle and streaming endpoints" },
        {
          name: "assistants",
          description: "Assistant discovery endpoints",
        },
      ],
    },
  });

  await app.register(swaggerUI, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
};

