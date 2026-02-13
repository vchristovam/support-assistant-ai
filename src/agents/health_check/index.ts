import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { thinkTool } from "../../tools/think.js";
import { checkIntegrationHealth } from "./tools/checkIntegrationHealth.js";
import { checkInternalService } from "./tools/checkInternalService.js";
import { getSystemMetrics } from "./tools/getSystemMetrics.js";
import { checkEndpoint } from "./tools/checkEndpoint.js";
import { HEALTH_CHECK_SYSTEM_PROMPT } from "../../prompts/agents/health_check.js";

export {
  checkIntegrationHealth,
  checkInternalService,
  getSystemMetrics,
  checkEndpoint,
};

export const createHealthCheckAgent = (llm: BaseChatModel) => {
  return createAgent({
    model: llm,
    tools: [
      thinkTool,
      checkIntegrationHealth,
      checkInternalService,
      getSystemMetrics,
      checkEndpoint,
    ],
    name: "health_check_agent",
    systemPrompt: HEALTH_CHECK_SYSTEM_PROMPT,
  });
};
