import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { tool } from "@langchain/core/tools";
import { BaseCheckpointSaver } from "@langchain/langgraph";
import { createAgent } from "langchain";
import { z } from "zod";
import { createDatabricksAgent } from "../databricks/index.js";
import { createDynatraceAgent } from "../dynatrace/index.js";
import { createKnowledgeAgent } from "../knowledge/index.js";
import { createOperationsAgent } from "../operations/index.js";
import { createHumanInterfaceAgent } from "../human_interface/index.js";
import { createHealthCheckAgent } from "../health_check/index.js";
import { createFilesystemAgent } from "../filesystem/index.js";
import { SUPERVISOR_SYSTEM_PROMPT } from "./prompts.js";
import { attempt_reasoning } from "./tools/thinking.js";

export { SUPERVISOR_SYSTEM_PROMPT } from "./prompts.js";

/**
 * Creates the support supervisor workflow that orchestrates all worker agents.
 *
 * Uses the tool-calling pattern recommended by LangChain:
 * - Each worker agent is wrapped as a tool
 * - Supervisor agent has these tools and routes via tool calls
 * - This provides more control over context engineering
 *
 * @param llm - Language model used by both the supervisor and all worker agents.
 * @param checkpointer - Optional checkpointer for state persistence.
 * @returns A compiled StateGraph ready to use.
 */
export const createSupportSupervisor = (
  llm: BaseChatModel,
  checkpointer?: BaseCheckpointSaver,
) => {
  // Create worker agents
  const databricksAgent = createDatabricksAgent(llm);
  const dynatraceAgent = createDynatraceAgent(llm);
  const knowledgeAgent = createKnowledgeAgent(llm);
  const operationsAgent = createOperationsAgent(llm);
  const humanInterfaceAgent = createHumanInterfaceAgent(llm);
  const healthCheckAgent = createHealthCheckAgent(llm);
  const filesystemAgent = createFilesystemAgent(llm);

  // Wrap each worker as a tool (recommended pattern from LangChain)
  const transferToDatabricks = tool(
    async ({ request }) => {
      const result = await databricksAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_databricks",
      description: `
Transfer to the Databricks agent for database queries, SQL execution, and data analytics.

Use this when the request involves:
- Querying databases or data warehouses
- Executing SQL queries
- Data analysis and exploration
- Order lookups or customer data retrieval
- Questions about data trends or metrics

Input: Natural language request about data or analytics.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Natural language request for data/analytics"),
      }),
    },
  );

  const transferToDynatrace = tool(
    async ({ request }) => {
      const result = await dynatraceAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_dynatrace",
      description: `
Transfer to the Dynatrace agent for system monitoring, observability, and error investigation.

Use this when the request involves:
- System errors or alerts
- Performance issues
- Log analysis
- Application monitoring
- Infrastructure health checks

Input: Natural language request about system/monitoring.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Natural language request about system/monitoring"),
      }),
    },
  );

  const transferToKnowledge = tool(
    async ({ request }) => {
      const result = await knowledgeAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_knowledge",
      description: `
Transfer to the Knowledge agent for documentation lookups, policy questions, and saving new verified information.

Use this when the request involves:
- How-to guides or procedures
- Company policies
- Documentation questions
- Best practices
- General knowledge base queries
- Saving new information or corrections to the knowledge base

Input: Natural language request about documentation, policies, or saving knowledge.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Natural language request about documentation"),
      }),
    },
  );

  const transferToOperations = tool(
    async ({ request }) => {
      const result = await operationsAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_operations",
      description: `
Transfer to the Operations agent for sensitive actions that modify data.

Use this when the request involves:
- Cancelling orders
- Modifying customer data
- Any action that changes system state
- Actions requiring human approval (HITL)

WARNING: These actions require human approval before proceeding.

Input: Natural language request for data modification.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Natural language request for data modification"),
      }),
    },
  );

  const transferToHumanInterface = tool(
    async ({ request }) => {
      const result = await humanInterfaceAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_human_interface",
      description: `
Transfer to the Human Interface agent when you need to ask the user a clarifying question.

Use this when:
- Information is missing or unclear
- You need specific details to proceed
- Multiple options exist and you need user preference

The Human Interface agent will ask the question and return the user's answer.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Context explaining what information is needed and why."),
      }),
    },
  );

  const transferToHealthCheck = tool(
    async ({ request }) => {
      const result = await healthCheckAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_health_check",
      description: `
Transfer to the Health Check agent when the user asks about system health, performance issues, or service status.

Use this when:
- User reports slowness or performance issues (e.g., "Calculator slow")
- User asks about service health or status
- User wants to check integration health
- User needs system metrics or diagnostics
- Troubleshooting errors or outages

The Health Check agent can check:
- Internal services (B3 calculator, order processing, etc.)
- External integrations (Databricks, Dynatrace, Azure)
- System metrics (performance, errors, resources)
- Specific HTTP endpoints

Input: Description of what health information is needed.
    `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe(
            "Description of the health check needed (e.g., 'Check B3 calculator health', 'System performance metrics')",
          ),
      }),
    },
  );

  const transferToFilesystem = tool(
    async ({ request }) => {
      const result = await filesystemAgent.invoke({
        messages: [{ role: "user", content: request }],
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },
    {
      name: "transfer_to_filesystem",
      description: `
Transfer to the Filesystem agent for file operations.

Use this when the request involves:
- Reading files
- Writing files
- Listing directories
- File management tasks

Input: Natural language request for file operations.
      `.trim(),
      schema: z.object({
        request: z
          .string()
          .describe("Natural language request for file operations"),
      }),
    },
  );

  // Create supervisor agent using standard createAgent pattern
  // This is the recommended approach from LangChain (not using langgraph-supervisor)
  return createAgent({
    model: llm,
    tools: [
      attempt_reasoning,
      transferToDatabricks,
      transferToDynatrace,
      transferToKnowledge,
      transferToOperations,
      transferToHumanInterface,
      transferToHealthCheck,
      transferToFilesystem,
    ],
    name: "supervisor",
    systemPrompt: SUPERVISOR_SYSTEM_PROMPT,
    checkpointer,
  });
};
