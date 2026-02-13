import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { askHumanTool } from "./tools/askHumanTool.js";
import { HUMAN_INTERFACE_SYSTEM_PROMPT } from "../../prompts/agents/human_interface.js";

export { askHumanTool } from "./tools/askHumanTool.js";

/**
 * Creates the human interface agent for asking clarifying questions.
 * Uses createAgent from langchain with askHumanTool that triggers interrupt.
 */
export const createHumanInterfaceAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [thinkTool, askHumanTool],
    name: "human_interface_agent",
    systemPrompt: HUMAN_INTERFACE_SYSTEM_PROMPT,
  });
};
