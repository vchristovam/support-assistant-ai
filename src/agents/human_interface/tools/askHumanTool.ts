import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";

/**
 * HITL interrupt value schema for Agent Chat UI compatibility
 */
interface HITLInterruptValue {
  type: string;
  description: string;
  value?: unknown;
  actions?: Array<{
    id: string;
    label: string;
    type: "approve" | "reject" | "edit" | "custom";
  }>;
  schema?: object;
}

/**
 * Resume response from interrupt
 */
interface HITLResumeResponse {
  action: "accept" | "reject" | "edit";
  value?: string;
}

export const askHumanTool = tool(
  async ({ question, context }) => {
    const interruptValue: HITLInterruptValue = {
      type: "input",
      description: context || "Please provide clarification",
      value: {
        question,
        context: context || "clarification_needed",
      },
      actions: [
        { id: "accept", label: "Submit Answer", type: "approve" },
        { id: "reject", label: "Cancel", type: "reject" },
      ],
      schema: {
        type: "object",
        properties: {
          answer: {
            type: "string",
            description: "Your response to the question",
          },
        },
        required: ["answer"],
      },
    };

    const userResponse = await interrupt<
      HITLInterruptValue,
      HITLResumeResponse
    >(interruptValue);

    if (userResponse.action === "reject") {
      return "User cancelled the request.";
    }

    const answer = userResponse.value || "";
    return `User Answer: ${answer}`;
  },
  {
    name: "ask_human",
    description:
      "Ask the user a clarifying question when information is missing or unclear.",
    schema: z.object({
      question: z.string().describe("The specific question to ask the user."),
      context: z.string().optional().describe("Why you need this information."),
    }),
  },
);
