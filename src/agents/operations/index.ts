import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { apiWriteTool } from "./tools/apiWriteTool.js";
import { OPERATIONS_SYSTEM_PROMPT } from "../../prompts/agents/operations.js";

export { apiWriteTool } from "./tools/apiWriteTool.js";

/**
 * Creates the operations agent with standard tool calling.
 * HITL is handled inside the apiWriteTool itself using interrupt().
 */
export const createOperationsAgent = (llm: BaseChatModel) =>
  createAgent({
    model: llm,
    tools: [thinkTool, apiWriteTool],
    name: "operations_agent",
    systemPrompt: OPERATIONS_SYSTEM_PROMPT,
  });
