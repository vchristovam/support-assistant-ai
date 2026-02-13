import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { getFilesystemTools } from "./tools.js";

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
    tools,
    name: "filesystem_agent",
    systemPrompt:
      "You are a filesystem agent. You can read files, write files, and list directories. Use the provided tools to interact with the filesystem.",
  });
};
