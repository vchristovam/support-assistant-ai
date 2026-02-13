import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { askHumanTool } from "./tools/askHumanTool.js";

export { askHumanTool } from "./tools/askHumanTool.js";

/**
 * Creates the human interface agent for asking clarifying questions.
 * Uses createAgent from langchain with askHumanTool that triggers interrupt.
 */
export const createHumanInterfaceAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [askHumanTool],
    name: "human_interface_agent",
  });
};
