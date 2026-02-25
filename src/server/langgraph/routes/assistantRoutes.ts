import type { FastifyInstance } from "fastify";
import { createAssistantRecord } from "../assistants.js";
import type { AssistantSearchBody } from "../types.js";
import { matchesRecord } from "../utils.js";

export const registerAssistantRoutes = (app: FastifyInstance): void => {
  app.post("/assistants/search", async (request, reply) => {
    const body = (request.body || {}) as AssistantSearchBody;
    const assistants = [
      createAssistantRecord("agent", "agent"),
      createAssistantRecord("support-agent", "support-agent"),
    ];

    const filtered = assistants
      .filter((assistant) =>
        body.graph_id ? assistant.graph_id === body.graph_id : true,
      )
      .filter((assistant) =>
        body.name
          ? typeof assistant.name === "string" &&
            assistant.name.toLowerCase().includes(body.name.toLowerCase())
          : true,
      )
      .filter((assistant) =>
        matchesRecord(
          body.metadata,
          (assistant.metadata as Record<string, unknown>) ?? {},
        ),
      );

    const offset = Math.max(0, body.offset ?? 0);
    const limit = Math.max(1, body.limit ?? 10);
    return reply.send(filtered.slice(offset, offset + limit));
  });

  app.get("/assistants/:assistant_id", async (request, reply) => {
    const { assistant_id: assistantId } = request.params as {
      assistant_id: string;
    };
    return reply.send(createAssistantRecord(assistantId, assistantId));
  });

  app.get("/assistants/:assistant_id/graph", async (_request, reply) => {
    return reply.send({
      nodes: [],
      edges: [],
    });
  });

  app.get("/assistants/:assistant_id/schemas", async (_request, reply) => {
    return reply.send({
      state_schema: {},
      config_schema: {},
    });
  });

  app.get("/assistants/:assistant_id/subgraphs", async (_request, reply) => {
    return reply.send({});
  });

  app.get(
    "/assistants/:assistant_id/subgraphs/:namespace",
    async (_request, reply) => {
      return reply.send({});
    },
  );
};
