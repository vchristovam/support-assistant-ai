import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { dqlTool } from "./tools/dqlTool.js";
import { problemsTool } from "./tools/problemsTool.js";

export const createDynatraceAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [dqlTool, problemsTool],
    name: "dynatrace_agent",
  });
};

export { dqlTool, problemsTool };
