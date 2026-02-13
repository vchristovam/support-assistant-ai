import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const genieTool = tool(
  async ({ question }) => {
    if (!question) throw new Error("Question is required");

    const mockResults = {
      answer: "Orders dropped 15% due to payment gateway outage",
      sql_generated:
        "SELECT date, count(*) FROM orders WHERE status = 'failed' GROUP BY date",
      confidence: 0.85,
    };

    return JSON.stringify(mockResults);
  },
  {
    name: "query_genie",
    description: "Ask a natural language question to Databricks Genie.",
    schema: z.object({
      question: z.string().describe("The natural language question to ask"),
    }),
  },
);
