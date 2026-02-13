import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createDatabricksAgent } from "../databricks/index.js";
import { createDynatraceAgent } from "../dynatrace/index.js";
import { createKnowledgeAgent } from "../knowledge/index.js";
import { createOperationsAgent } from "../operations/index.js";
import { createHumanInterfaceAgent } from "../human_interface/index.js";
import { createHealthCheckAgent } from "../health_check/index.js";
import { createFilesystemAgent } from "../filesystem/index.js";
import { executeWorkersInParallel } from "../../graph/utils/parallelExecution.js";
import { attempt_reasoning } from "./tools/thinking.js";
import { thinkTool } from "../../tools/think.js";
import { AGENT_REGISTRY } from "../../prompts/agents.js";
import { maxConcurrentWorkers } from "../../config/index.js";

/**
 * Creates the transfer tools for the supervisor to communicate with worker agents.
 * 
 * @param llm - Language model used to instantiate worker agents.
 * @returns Array of tools available to the supervisor.
 */
export const createSupervisorTools = (llm: BaseChatModel) => {
  // Create worker agents
  const databricksAgent = createDatabricksAgent(llm);
  const dynatraceAgent = createDynatraceAgent(llm);
  const knowledgeAgent = createKnowledgeAgent(llm);
  const operationsAgent = createOperationsAgent(llm);
  const humanInterfaceAgent = createHumanInterfaceAgent(llm);
  const healthCheckAgent = createHealthCheckAgent(llm);
  const filesystemAgent = createFilesystemAgent(llm);

  const agentDatabricks = AGENT_REGISTRY.databricks;
  const transferToDatabricks = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "Databricks",
        invoke: async () => {
          const result = await databricksAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_databricks",
      description: `Transfer to the Databricks agent for ${agentDatabricks.purpose.toLowerCase()}

Use this when the request involves:
${agentDatabricks.whenToUse.map((w) => `- ${w}`).join("\n")}

Input: One or more natural language requests about data or analytics.`,
      schema: z.object({
        request: z.string().optional().describe("Single natural language request"),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of natural language requests to process in parallel"),
      }),
    },
  );

  const agentDynatrace = AGENT_REGISTRY.dynatrace;
  const transferToDynatrace = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "Dynatrace",
        invoke: async () => {
          const result = await dynatraceAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_dynatrace",
      description: `Transfer to the Dynatrace agent for ${agentDynatrace.purpose.toLowerCase()}

Use this when the request involves:
${agentDynatrace.whenToUse.map((w) => `- ${w}`).join("\n")}

Input: One or more natural language requests about system/monitoring.`,
      schema: z.object({
        request: z.string().optional().describe("Single natural language request"),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of natural language requests to process in parallel"),
      }),
    },
  );

  const agentKnowledge = AGENT_REGISTRY.knowledge;
  const transferToKnowledge = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "Knowledge",
        invoke: async () => {
          const result = await knowledgeAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_knowledge",
      description: `Transfer to the Knowledge agent for ${agentKnowledge.purpose.toLowerCase()}

Use this when the request involves:
${agentKnowledge.whenToUse.map((w) => `- ${w}`).join("\n")}

Input: One or more natural language requests about documentation, policies, or saving knowledge.`,
      schema: z.object({
        request: z.string().optional().describe("Single natural language request"),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of natural language requests to process in parallel"),
      }),
    },
  );

  const agentOperations = AGENT_REGISTRY.operations;
  const transferToOperations = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "Operations",
        invoke: async () => {
          const result = await operationsAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_operations",
      description: `Transfer to the Operations agent for ${agentOperations.purpose.toLowerCase()}

Use this when the request involves:
${agentOperations.whenToUse.map((w) => `- ${w}`).join("\n")}

WARNING: These actions require human approval before proceeding.

Input: One or more natural language requests for data modification.`,
      schema: z.object({
        request: z.string().optional().describe("Single natural language request"),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of natural language requests to process in parallel"),
      }),
    },
  );

  const agentHumanInterface = AGENT_REGISTRY.human_interface;
  const transferToHumanInterface = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "HumanInterface",
        invoke: async () => {
          const result = await humanInterfaceAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_human_interface",
      description: `Transfer to the Human Interface agent for ${agentHumanInterface.purpose.toLowerCase()}

Use this when:
${agentHumanInterface.whenToUse.map((w) => `- ${w}`).join("\n")}

The Human Interface agent will ask the question and return the user's answer.

Input: One or more contexts explaining what information is needed and why.`,
      schema: z.object({
        request: z
          .string()
          .optional()
          .describe("Single context explaining what information is needed"),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of contexts explaining what information is needed"),
      }),
    },
  );

  const agentHealthCheck = AGENT_REGISTRY.health_check;
  const transferToHealthCheck = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "HealthCheck",
        invoke: async () => {
          const result = await healthCheckAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_health_check",
      description: `Transfer to the Health Check agent for ${agentHealthCheck.purpose.toLowerCase()}

Use this when:
${agentHealthCheck.whenToUse.map((w) => `- ${w}`).join("\n")}

The Health Check agent can:
${agentHealthCheck.capabilities.map((c) => `- ${c}`).join("\n")}

Input: One or more descriptions of what health information is needed.`,
      schema: z.object({
        request: z
          .string()
          .optional()
          .describe(
            "Single description of the health check needed (e.g., 'Check B3 calculator health')",
          ),
        requests: z
          .array(z.string())
          .optional()
          .describe("Batch of descriptions of the health checks needed"),
      }),
    },
  );

  const agentFilesystem = AGENT_REGISTRY.filesystem;
  const transferToFilesystem = tool(
    async ({ request, requests }) => {
      const reqs = requests || (request ? [request] : []);
      if (reqs.length === 0) return "No request provided";
      const workers = reqs.map((req: string) => ({
        name: "Filesystem",
        invoke: async () => {
          const result = await filesystemAgent.invoke({
            messages: [{ role: "user", content: req }],
          });
          return result.messages[result.messages.length - 1].content;
        },
      }));
      const results = await executeWorkersInParallel(
        workers,
        maxConcurrentWorkers.parse(undefined),
      );
      return results.map((r) => r.result).join("\n\n---\n\n");
    },
    {
      name: "transfer_to_filesystem",
      description: `Transfer to the Filesystem agent for ${agentFilesystem.purpose.toLowerCase()}

Use this when the request involves:
${agentFilesystem.whenToUse.map((w) => `- ${w}`).join("\n")}

Input: One or more natural language requests for file operations.`,
      schema: z.object({
        request: z
          .string()
          .optional()
          .describe("Single natural language request for file operations"),
        requests: z
          .array(z.string())
          .optional()
          .describe(
            "Batch of natural language requests for file operations to process in parallel",
          ),
      }),
    },
  );

  return [
    thinkTool,
    attempt_reasoning,
    transferToDatabricks,
    transferToDynatrace,
    transferToKnowledge,
    transferToOperations,
    transferToHumanInterface,
    transferToHealthCheck,
    transferToFilesystem,
  ];
};
