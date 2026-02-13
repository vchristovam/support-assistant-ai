import type { FastifyInstance } from "fastify";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { config } from "../../config/index.js";

interface GraphNode {
  id: string;
  type: string;
  data?: {
    name?: string;
    description?: string;
  };
}

interface GraphEdge {
  source: string;
  target: string;
  conditional?: boolean;
}

interface DrawableGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  drawMermaid: () => string;
}

export const registerSupportRoutes = (
  app: FastifyInstance,
  llm: BaseChatModel | undefined,
  checkpointer: BaseCheckpointSaver,
) => {
  app.get("/support/graph/mermaid", async (_request, reply) => {
    try {
      if (!llm) {
        reply.status(503);
        return {
          error: "ServiceUnavailable",
          message: "LLM not initialized",
        };
      }

      const { createSupportSupervisor } =
        await import("../../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm, checkpointer);

      const drawableGraph = (await graph.getGraphAsync()) as DrawableGraph;
      const mermaidDiagram = drawableGraph.drawMermaid();

      return {
        mermaid: mermaidDiagram,
        description:
          "Copy this Mermaid diagram to https://mermaid.live/ to visualize the graph",
      };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/graph/nodes", async (_request, reply) => {
    try {
      if (!llm) {
        reply.status(503);
        return {
          error: "ServiceUnavailable",
          message: "LLM not initialized",
        };
      }

      const { createSupportSupervisor } =
        await import("../../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm, checkpointer);

      const drawableGraph = (await graph.getGraphAsync()) as DrawableGraph;
      const nodes = drawableGraph.nodes.map((node: GraphNode) => ({
        id: node.id,
        type: node.type,
        name: node.data?.name || node.id,
      }));

      return { nodes };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/graph/edges", async (_request, reply) => {
    try {
      if (!llm) {
        reply.status(503);
        return {
          error: "ServiceUnavailable",
          message: "LLM not initialized",
        };
      }

      const { createSupportSupervisor } =
        await import("../../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm, checkpointer);

      const drawableGraph = (await graph.getGraphAsync()) as DrawableGraph;
      const edges = drawableGraph.edges.map((edge: GraphEdge) => ({
        source: edge.source,
        target: edge.target,
        conditional: edge.conditional || false,
      }));

      return { edges };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/config", async (_request, reply) => {
    try {
      const safeConfig = {
        app: {
          env: config.app.env,
          port: config.app.port,
          isDev: config.app.isDev,
        },
        azureOpenAI: {
          endpoint: config.azureOpenAI.endpoint,
          deploymentName: config.azureOpenAI.deploymentName,
          embeddingDeploymentName: config.azureOpenAI.embeddingDeploymentName,
          apiVersion: config.azureOpenAI.apiVersion,
          apiKey: config.azureOpenAI.apiKey
            ? "***configured***"
            : "***missing***",
        },
        knowledge: {
          endpoint: config.knowledge.endpoint,
          index: config.knowledge.index,
          key: config.knowledge.key ? "***configured***" : "***missing***",
        },
        databricks: {
          host: config.databricks.host,
          sqlWarehouseId: config.databricks.sqlWarehouseId,
          genieSpaceId: config.databricks.genieSpaceId,
          token: config.databricks.token ? "***configured***" : "***missing***",
        },
        dynatrace: {
          url: config.dynatrace.url,
          enabled: config.dynatrace.enabled,
          token: config.dynatrace.token ? "***configured***" : "***missing***",
        },
        redis: {
          url: config.redis.url ? "***configured***" : "***missing***",
        },
        sqlServer: {
          server: config.sqlServer.server,
          port: config.sqlServer.port,
          database: config.sqlServer.database,
          user: config.sqlServer.user,
          options: config.sqlServer.options,
          password: config.sqlServer.password
            ? "***configured***"
            : "***missing***",
        },
      };

      return safeConfig;
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/agents", async (_request, reply) => {
    try {
      if (!llm) {
        reply.status(503);
        return {
          error: "ServiceUnavailable",
          message: "LLM not initialized",
        };
      }

      const { createSupportSupervisor } =
        await import("../../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm, checkpointer);

      const drawableGraph = (await graph.getGraphAsync()) as DrawableGraph;
      const agentNodes = drawableGraph.nodes.filter(
        (node: GraphNode) =>
          node.id.includes("agent") ||
          node.id === "supervisor" ||
          node.data?.name?.includes("agent"),
      );

      interface AgentInfo {
        id: string;
        name: string;
        type: string;
      }

      const agents: AgentInfo[] = agentNodes.map((node: GraphNode) => ({
        id: node.id,
        name: node.data?.name || node.id,
        type: node.type,
      }));

      return {
        agents,
        supervisor: agents.find(
          (a: AgentInfo) =>
            a.id === "supervisor" || a.name?.includes("supervisor"),
        ),
        workerAgents: agents.filter(
          (a: AgentInfo) =>
            a.id !== "supervisor" && !a.name?.includes("supervisor"),
        ),
      };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/tools", async (_request, reply) => {
    try {
      if (!llm) {
        reply.status(503);
        return {
          error: "ServiceUnavailable",
          message: "LLM not initialized",
        };
      }

      const { createSupportSupervisor } =
        await import("../../agents/supervisor/index.js");
      const graph = createSupportSupervisor(llm, checkpointer);

      const drawableGraph = (await graph.getGraphAsync()) as DrawableGraph;
      const toolNodes = drawableGraph.nodes.filter(
        (node: GraphNode) =>
          node.type === "tool" ||
          node.id.includes("tool") ||
          node.data?.name?.includes("tool"),
      );

      const tools = toolNodes.map((node: GraphNode) => ({
        id: node.id,
        name: node.data?.name || node.id,
        description: node.data?.description || "No description",
      }));

      return { tools };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });

  app.get("/support/checkpoint/status", async (_request, reply) => {
    try {
      let status: string;
      let type: string;

      if ("get" in checkpointer && typeof checkpointer.get === "function") {
        try {
          await checkpointer.get({ configurable: { thread_id: "test" } });
          status = "connected";
        } catch {
          status = "error";
        }
      } else {
        status = "unknown";
      }

      if (checkpointer.constructor.name.includes("Redis")) {
        type = "redis";
      } else if (checkpointer.constructor.name.includes("SqlServer")) {
        type = "sqlserver";
      } else if (checkpointer.constructor.name.includes("Memory")) {
        type = "memory";
      } else {
        type = "unknown";
      }

      return {
        type,
        status,
        className: checkpointer.constructor.name,
      };
    } catch (error) {
      reply.status(500);
      return {
        error: "InternalError",
        message: (error as Error).message,
      };
    }
  });
};
