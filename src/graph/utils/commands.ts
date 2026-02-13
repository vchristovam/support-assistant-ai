import { Command } from "@langchain/langgraph";

export const END = "__end__";
export const START = "__start__";

export const createCommand = <T extends string>(
  goto: T,
  update?: Record<string, unknown>,
) => new Command({ goto, update });

export type RouteTarget =
  | "supervisor"
  | "databricks_agent"
  | "dynatrace_agent"
  | "knowledge_agent"
  | "operations_agent"
  | "human_interface_agent"
  | "health_check_agent"
  | "filesystem_agent"
  | "__end__";
