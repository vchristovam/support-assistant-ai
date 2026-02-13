import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const getSystemMetrics = tool(
  async ({ metricType }) => {
    // Mock implementation
    const metrics: Record<string, object> = {
      performance: {
        avgResponseTime: "145ms",
        p95ResponseTime: "280ms",
        p99ResponseTime: "450ms",
        throughput: "1,200 req/min",
      },
      errors: {
        errorRate: "0.5%",
        totalErrors: 12,
        topErrors: ["TimeoutException", "ConnectionRefused"],
      },
      resources: {
        cpuUsage: "45%",
        memoryUsage: "68%",
        diskUsage: "72%",
        activeConnections: 156,
      },
      all: {
        performance: {
          avgResponseTime: "145ms",
          p95ResponseTime: "280ms",
          p99ResponseTime: "450ms",
          throughput: "1,200 req/min",
        },
        errors: {
          errorRate: "0.5%",
          totalErrors: 12,
          topErrors: ["TimeoutException", "ConnectionRefused"],
        },
        resources: {
          cpuUsage: "45%",
          memoryUsage: "68%",
          diskUsage: "72%",
          activeConnections: 156,
        },
      },
    };

    return JSON.stringify(metrics[metricType || "all"] || metrics.all);
  },
  {
    name: "get_system_metrics",
    description:
      "Get system performance metrics, error rates, and resource utilization",
    schema: z.object({
      metricType: z
        .enum(["performance", "errors", "resources", "all"])
        .optional()
        .describe("Type of metrics to retrieve"),
    }),
  },
);
