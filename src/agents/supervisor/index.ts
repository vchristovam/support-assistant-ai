import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseCheckpointSaver, StateGraph, START, END } from "@langchain/langgraph";
import { TeamStateAnnotation } from "../../graph/state.js";
import { createSupervisorSystemPrompt } from "../../prompts/supervisor.js";
import { createIterationTrackingWrapper } from "./wrapper.js";
import { createSupervisorTools } from "./tools.js";
import { createSupervisorNodes } from "./nodes.js";

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
  const tools = createSupervisorTools(llm);

  const systemPrompt = createSupervisorSystemPrompt({
    date: new Date().toISOString(),
    activeAgents: [
      "databricks",
      "dynatrace",
      "knowledge",
      "operations",
      "human_interface",
      "health_check",
      "filesystem",
    ],
  });

  const { supervisorNode, toolsNode } = createSupervisorNodes(
    llm,
    tools,
    systemPrompt,
  );

  const workflow = new StateGraph(TeamStateAnnotation)
    .addNode("supervisor", supervisorNode, {
      ends: ["tools", END],
    })
    .addNode("tools", toolsNode)
    .addEdge(START, "supervisor")
    .addEdge("tools", "supervisor");

  const agent = workflow.compile({ checkpointer });
  (agent as any).graph = agent;

  return createIterationTrackingWrapper(agent);
};
