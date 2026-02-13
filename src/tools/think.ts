import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Strategic reflection tool for structured agent thinking.
 *
 * Use this tool to pause and reflect before complex decisions, after receiving
 * tool results, or when determining if task completion criteria are met.
 */
export const thinkTool = tool(
  async ({ reflection }) => {
    console.log(`[THINK] ${reflection}`);
    return `Reflection recorded: ${reflection}`;
  },
  {
    name: "think",
    description: `Strategic reflection tool for structured agent thinking.

WHEN TO USE:
- Before making complex routing decisions (which worker to dispatch)
- After receiving tool results to analyze what was learned
- When determining if task completion criteria are met
- Before responding to user with final answer
- When facing ambiguity about next steps
- After errors occur to determine recovery strategy

YOUR REFLECTION SHOULD ADDRESS:
1. Current State: What do I know right now? What data/results do I have?
2. Gap Analysis: What's missing? What assumptions am I making?
3. Quality Check: Are the results sufficient and accurate? Any inconsistencies?
4. Next Steps: What should I do next and why?

Example good reflection:
"Current State: Received Dynatrace metrics showing CPU spike at 14:30. The issue correlates with deployment timestamp. Gap Analysis: I don't know if rollback completed successfully or if alert thresholds were updated. Quality Check: Metrics look consistent but I need to verify the deployment ID matches the incident report. Next Steps: Query deployment logs to confirm rollback status before concluding."

The reflection parameter should be a structured analysis following the format above.`,
    schema: z.object({
      reflection: z
        .string()
        .describe(
          "A structured reflection addressing Current State, Gap Analysis, Quality Check, and Next Steps"
        ),
    }),
  }
);
