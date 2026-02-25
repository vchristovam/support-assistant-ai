import type { FastifyInstance } from "fastify";

export const registerSystemRoutes = (app: FastifyInstance): void => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        summary: "Health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
            },
            required: ["status"],
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({ status: "ok" });
    },
  );

  app.get(
    "/info",
    {
      schema: {
        tags: ["system"],
        summary: "Server capabilities",
        response: {
          200: {
            type: "object",
            properties: {
              version: { type: "string" },
              langgraph_js_version: { type: "string" },
              langgraph_py_version: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              flags: {
                type: "object",
                properties: {
                  assistive_ui: { type: "boolean" },
                  subgraphs: { type: "boolean" },
                  threads: { type: "boolean" },
                  runs: { type: "boolean" },
                },
                required: ["assistive_ui", "subgraphs", "threads", "runs"],
              },
            },
            required: [
              "version",
              "langgraph_js_version",
              "langgraph_py_version",
              "flags",
            ],
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        version: "0.1.0",
        langgraph_js_version: "1.x",
        langgraph_py_version: null,
        flags: {
          assistive_ui: false,
          subgraphs: true,
          threads: true,
          runs: true,
        },
      });
    },
  );
};
