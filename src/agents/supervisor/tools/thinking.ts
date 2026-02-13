import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const attempt_reasoning = new DynamicStructuredTool({
  name: "attempt_reasoning",
  description: "Record a thought or reasoning step.",
  schema: z.object({
    thought: z.string().describe("The thought or reasoning step to record."),
  }),
  func: async ({ thought }) => {
    console.log(`[Reasoning]: ${thought}`);
    return "Thought recorded.";
  },
});
