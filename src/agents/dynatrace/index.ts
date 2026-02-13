import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { dqlTool } from "./tools/dqlTool.js";
import { problemsTool } from "./tools/problemsTool.js";
import { DYNATRACE_SYSTEM_PROMPT } from "../../prompts/agents/dynatrace.js";

export const createDynatraceAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [thinkTool, dqlTool, problemsTool],
    name: "dynatrace_agent",
    systemPrompt: DYNATRACE_SYSTEM_PROMPT,
  });
};

export { dqlTool, problemsTool };
