import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const sqlTool = tool(
  async ({ query }) => {
    if (!query) throw new Error("Query is required");

    const mockResults = {
      rows: [
        { order_id: "ORD-001", status: "shipped", amount: 129.99 },
        { order_id: "ORD-002", status: "pending", amount: 59.5 },
      ],
      rowCount: 2,
    };

    return JSON.stringify(mockResults);
  },
  {
    name: "query_sql",
    description: "Execute a SQL query against the Databricks warehouse.",
    schema: z.object({
      query: z.string().describe("The SQL query to execute"),
    }),
  },
);
