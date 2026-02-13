import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const problemsTool = tool(
  async ({ timeframe: _timeframe }) => {
    const mockResults = {
      problems: [
        {
          id: "P-2024-001",
          title: "High error rate on payment-service",
          severity: "CRITICAL",
          status: "OPEN",
          startTime: "2024-01-15T10:00:00Z",
        },
        {
          id: "P-2024-002",
          title: "Increased latency on order-api",
          severity: "WARNING",
          status: "OPEN",
          startTime: "2024-01-15T09:45:00Z",
        },
      ],
      totalCount: 2,
    };

    return JSON.stringify(mockResults);
  },
  {
    name: "get_problems",
    description: "Retrieve active problems and alerts from Dynatrace.",
    schema: z.object({
      timeframe: z
        .string()
        .optional()
        .describe("Timeframe for the problems (e.g., -2h, -30m)"),
    }),
  },
);
