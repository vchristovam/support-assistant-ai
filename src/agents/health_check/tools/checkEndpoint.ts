import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const checkEndpoint = tool(
  async ({ endpoint }) => {
    // Mock implementation
    const endpointChecks: Record<string, object> = {
      "/health": {
        status: 200,
        responseTime: "5ms",
        healthy: true,
      },
      "/api/chat": {
        status: 200,
        responseTime: "145ms",
        healthy: true,
      },
      "/api/data": {
        status: 503,
        responseTime: "5000ms",
        healthy: false,
        error: "Service Unavailable",
      },
      "/chat": {
        status: 200,
        responseTime: "150ms",
        healthy: true,
      },
      "/chat/resume": {
        status: 200,
        responseTime: "120ms",
        healthy: true,
      },
      "/chat/answer": {
        status: 200,
        responseTime: "110ms",
        healthy: true,
      },
    };

    return JSON.stringify(
      endpointChecks[endpoint] || {
        status: "unknown",
        error: `Endpoint '${endpoint}' not monitored`,
        monitoredEndpoints: Object.keys(endpointChecks),
      },
    );
  },
  {
    name: "check_endpoint",
    description:
      "Check the health and response time of a specific HTTP endpoint",
    schema: z.object({
      endpoint: z
        .string()
        .describe("The endpoint path to check (e.g., '/health', '/api/chat')"),
    }),
  },
);
