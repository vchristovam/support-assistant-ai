import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { getFilesystemTools } from "./tools.js";
import { FILESYSTEM_SYSTEM_PROMPT } from "../../prompts/agents/filesystem.js";

/**
 * Creates the filesystem agent.
 *
 * @param llm - The language model to use.
 * @returns A promise that resolves to the filesystem agent (Runnable).
 */
export const createFilesystemAgent = (llm: BaseChatModel) => {
  const tools = getFilesystemTools();

  return createAgent({
    model: llm,
    tools: [thinkTool, ...tools],
    name: "filesystem_agent",
    systemPrompt: FILESYSTEM_SYSTEM_PROMPT,
  });
};
