/**
 * Agent Description Registry
 *
 * Single source of truth for all agent descriptions used across the system.
 * Eliminates duplication between prompts and tool definitions.
 */

/**
 * Interface describing an agent's purpose and capabilities.
 * Used for routing decisions and prompt generation.
 */
export interface AgentDescription {
  /** The agent's identifier (e.g., 'databricks', 'operations') */
  name: string;
  /** One-line summary of what this agent does */
  purpose: string;
  /** Conditions when this agent should be selected */
  whenToUse: string[];
  /** List of capabilities this agent provides */
  capabilities: string[];
}

/**
 * Registry of all available agents in the system.
 * This is the single source of truth for agent metadata.
 */
export const AGENT_REGISTRY: Record<string, AgentDescription> = {
  /**
   * Databricks Agent
   * Handles database queries, SQL execution, and data analytics.
   */
  databricks: {
    name: "databricks",
    purpose:
      "Database queries, SQL execution, and data analytics on Databricks data warehouses.",
    whenToUse: [
      "Querying databases or data warehouses",
      "Executing SQL queries",
      "Data analysis and exploration",
      "Order lookups or customer data retrieval",
      "Questions about data trends or metrics",
    ],
    capabilities: [
      "Execute SQL queries via sqlTool",
      "Query Databricks AI via genieTool",
      "Retrieve customer data and order information",
      "Analyze data trends and generate reports",
    ],
  },

  /**
   * Dynatrace Agent
   * Handles system monitoring, observability, and error investigation.
   */
  dynatrace: {
    name: "dynatrace",
    purpose:
      "System monitoring, observability, and error investigation via Dynatrace.",
    whenToUse: [
      "System errors or alerts",
      "Performance issues",
      "Log analysis",
      "Application monitoring",
      "Infrastructure health checks",
    ],
    capabilities: [
      "Execute DQL queries via dqlTool",
      "Fetch active problems via problemsTool",
      "Analyze system logs and metrics",
      "Monitor application and infrastructure health",
      "Investigate performance issues and bottlenecks",
    ],
  },

  /**
   * Knowledge Agent
   * Handles documentation lookups, policy questions, and RAG operations.
   */
  knowledge: {
    name: "knowledge",
    purpose:
      "Documentation lookups, policy questions, and saving verified information to the knowledge base.",
    whenToUse: [
      "How-to guides or procedures",
      "Company policies",
      "Documentation questions",
      "Best practices",
      "General knowledge base queries",
      "Saving new information or corrections to the knowledge base",
    ],
    capabilities: [
      "Search knowledge base via vectorSearchTool",
      "Save verified information via saveKnowledgeTool",
      "Retrieve documentation and procedures",
      "Answer policy and best practice questions",
      "Update knowledge base with new information",
    ],
  },

  /**
   * Operations Agent
   * Handles sensitive modifications that require HITL approval.
   */
  operations: {
    name: "operations",
    purpose:
      "Sensitive actions that modify data, requiring human-in-the-loop (HITL) approval.",
    whenToUse: [
      "Cancelling orders",
      "Modifying customer data",
      "Any action that changes system state",
      "Actions requiring human approval (HITL)",
    ],
    capabilities: [
      "Execute write operations via apiWriteTool",
      "Cancel orders and modify customer records",
      "Request human approval for sensitive actions",
      "Modify system state with HITL confirmation",
    ],
  },

  /**
   * Human Interface Agent
   * Handles user clarification and questions.
   */
  human_interface: {
    name: "human_interface",
    purpose:
      "Ask clarifying questions to the user when information is missing or unclear.",
    whenToUse: [
      "Information is missing or unclear",
      "You need specific details to proceed",
      "Multiple options exist and you need user preference",
    ],
    capabilities: [
      "Ask clarifying questions via askHumanTool",
      "Gather missing information from the user",
      "Present options and capture user preferences",
      "Handle user responses and return answers",
    ],
  },

  /**
   * Health Check Agent
   * Handles system diagnostics and health monitoring.
   */
  health_check: {
    name: "health_check",
    purpose:
      "System health diagnostics, performance monitoring, and service status checks.",
    whenToUse: [
      "User reports slowness or performance issues (e.g., 'Calculator slow')",
      "User asks about service health or status",
      "User wants to check integration health",
      "User needs system metrics or diagnostics",
      "Troubleshooting errors or outages",
    ],
    capabilities: [
      "Check internal services via checkInternalService tool",
      "Monitor external integrations via checkIntegrationHealth tool",
      "Retrieve system metrics via getSystemMetrics tool",
      "Check specific HTTP endpoints via checkEndpoint tool",
      "Diagnose performance issues and outages",
    ],
  },

  /**
   * Filesystem Agent
   * Handles file operations and directory management.
   */
  filesystem: {
    name: "filesystem",
    purpose:
      "File operations including reading, writing, and directory management.",
    whenToUse: [
      "Reading files",
      "Writing files",
      "Listing directories",
      "File management tasks",
    ],
    capabilities: [
      "Read file contents",
      "Write files to disk",
      "List directory contents",
      "Perform file management operations",
    ],
  },
};

/**
 * Get an agent description by name.
 *
 * @param name - The agent name (e.g., 'databricks', 'operations')
 * @returns The agent description, or undefined if not found
 */
export function getAgent(name: string): AgentDescription | undefined {
  return AGENT_REGISTRY[name];
}

/**
 * Get all registered agent descriptions.
 *
 * @returns Array of all agent descriptions
 */
export function getAllAgents(): AgentDescription[] {
  return Object.values(AGENT_REGISTRY);
}

/**
 * Format an agent description for XML-style prompts.
 * Generates a structured representation suitable for LLM consumption.
 *
 * @param agent - The agent description to format
 * @returns Formatted string for use in prompts
 *
 * @example
 * ```typescript
 * const databricks = getAgent('databricks');
 * const formatted = formatAgentForPrompt(databricks);
 * // Returns:
 * // <agent name="databricks">
 * //   <purpose>Database queries, SQL execution...</purpose>
 * //   <when_to_use>
 * //     - Querying databases or data warehouses
 * //     - Executing SQL queries
 * //     ...
 * //   </when_to_use>
 * //   <capabilities>
 * //     - Execute SQL queries via sqlTool
 * //     - Query Databricks AI via genieTool
 * //     ...
 * //   </capabilities>
 * // </agent>
 * ```
 */
export function formatAgentForPrompt(agent: AgentDescription): string {
  const whenToUseList = agent.whenToUse
    .map((item) => `    - ${item}`)
    .join("\n");
  const capabilitiesList = agent.capabilities
    .map((item) => `    - ${item}`)
    .join("\n");

  return `<agent name="${agent.name}">
  <purpose>${agent.purpose}</purpose>
  <when_to_use>
${whenToUseList}
  </when_to_use>
  <capabilities>
${capabilitiesList}
  </capabilities>
</agent>`;
}

/**
 * Format all agents for use in a system prompt.
 * Generates a complete agent registry section.
 *
 * @returns Formatted string containing all agents
 */
export function formatAllAgentsForPrompt(): string {
  const agents = getAllAgents();
  const formattedAgents = agents.map(formatAgentForPrompt).join("\n\n");

  return `<available_agents>
${formattedAgents}
</available_agents>`;
}
