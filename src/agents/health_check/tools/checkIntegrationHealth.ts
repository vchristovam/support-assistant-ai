import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const checkIntegrationHealth = tool(
  async ({ integration }) => {
    // Mock implementation for now
    const healthData: Record<string, object> = {
      databricks: {
        status: "healthy",
        latency: "45ms",
        lastCheck: new Date().toISOString(),
      },
      dynatrace: {
        status: "healthy",
        latency: "23ms",
        lastCheck: new Date().toISOString(),
      },
      azure_search: {
        status: "degraded",
        latency: "120ms",
        error: "High latency detected",
      },
      redis: {
        status: "healthy",
        latency: "2ms",
        lastCheck: new Date().toISOString(),
      },
      all: {
        databricks: { status: "healthy", latency: "45ms" },
        dynatrace: { status: "healthy", latency: "23ms" },
        azure_search: {
          status: "degraded",
          latency: "120ms",
          error: "High latency",
        },
        redis: { status: "healthy", latency: "2ms" },
        overall: "degraded",
      },
    };

    return JSON.stringify(
      healthData[integration] || { error: "Unknown integration" },
    );
  },
  {
    name: "check_integration_health",
    description:
      "Check the health status of external integrations (Databricks, Dynatrace, Azure, etc.)",
    schema: z.object({
      integration: z
        .enum(["databricks", "dynatrace", "azure_search", "redis", "all"])
        .describe("The integration to check, or 'all' for comprehensive check"),
    }),
  },
);
