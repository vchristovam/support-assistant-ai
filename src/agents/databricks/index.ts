import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { sqlTool } from "./tools/sqlTool.js";
import { genieTool } from "./tools/genieTool.js";

export { sqlTool, genieTool };

export const createDatabricksAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [sqlTool, genieTool],
    name: "databricks_agent",
  });
};
