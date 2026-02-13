import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { sqlTool } from "./tools/sqlTool.js";
import { genieTool } from "./tools/genieTool.js";
import { DATABRICKS_SYSTEM_PROMPT } from "../../prompts/agents/databricks.js";

export { sqlTool, genieTool };

export const createDatabricksAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [thinkTool, sqlTool, genieTool],
    name: "databricks_agent",
    systemPrompt: DATABRICKS_SYSTEM_PROMPT,
  });
};
