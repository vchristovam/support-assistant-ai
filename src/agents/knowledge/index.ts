import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { vectorSearchTool } from "./tools/vectorSearch.js";
import { saveKnowledgeTool } from "./tools/saveKnowledge.js";
import { createAgent } from "langchain";

export const createKnowledgeAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [vectorSearchTool, saveKnowledgeTool],
    name: "knowledge_agent",
    systemPrompt:
      "You are a knowledge specialist agent. Your primary role is to search for information in the knowledge base and provide accurate answers. Additionally, you have the ability to save new, verified information to the knowledge base using the save_knowledge tool. Use this tool when you encounter important information that should be preserved for future use, or when the user provides corrections or new facts that are confirmed to be accurate.",
  });
};
