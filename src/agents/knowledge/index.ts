import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { thinkTool } from "../../tools/think.js";
import { vectorSearchTool } from "./tools/vectorSearch.js";
import { saveKnowledgeTool } from "./tools/saveKnowledge.js";
import { createAgent } from "langchain";
import { KNOWLEDGE_SYSTEM_PROMPT } from "../../prompts/agents/knowledge.js";

export const createKnowledgeAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [thinkTool, vectorSearchTool, saveKnowledgeTool],
    name: "knowledge_agent",
    systemPrompt: KNOWLEDGE_SYSTEM_PROMPT,
  });
};
