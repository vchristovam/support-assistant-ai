import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { apiWriteTool } from "./tools/apiWriteTool.js";

export { apiWriteTool } from "./tools/apiWriteTool.js";

/**
 * Creates the operations agent with standard tool calling.
 * HITL is handled inside the apiWriteTool itself using interrupt().
 */
export const createOperationsAgent = (llm: BaseChatModel) =>
  createAgent({
    model: llm,
    tools: [apiWriteTool],
    name: "operations_agent",
  });
