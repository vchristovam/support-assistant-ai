import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createAgent } from "langchain";
import { checkIntegrationHealth } from "./tools/checkIntegrationHealth.js";
import { checkInternalService } from "./tools/checkInternalService.js";
import { getSystemMetrics } from "./tools/getSystemMetrics.js";
import { checkEndpoint } from "./tools/checkEndpoint.js";

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
      checkIntegrationHealth,
      checkInternalService,
      getSystemMetrics,
      checkEndpoint,
    ],
    name: "health_check_agent",
  });
};
