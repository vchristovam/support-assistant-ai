import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const dqlTool = tool(
  async ({ query }) => {
    if (!query) throw new Error("Query is required");

    const mockResults = {
      records: [
        {
          timestamp: "2024-01-15T10:30:00Z",
          level: "ERROR",
          message: "Connection timeout to payment-service",
          service: "order-api",
        },
        {
          timestamp: "2024-01-15T10:31:00Z",
          level: "WARN",
          message: "Retry attempt 3/5",
          service: "order-api",
        },
      ],
      recordCount: 2,
    };

    return JSON.stringify(mockResults);
  },
  {
    name: "execute_dql",
    description:
      "Execute a Dynatrace Query Language (DQL) query to retrieve logs and metrics.",
    schema: z.object({
      query: z.string().describe("The DQL query to execute"),
    }),
  },
);
