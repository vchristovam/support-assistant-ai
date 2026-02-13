import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { interrupt } from "@langchain/langgraph";
import { indexDocument } from "../../../services/azureSearch.js";

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

interface HITLResumeResponse {
  action: "accept" | "reject" | "edit";
  value?: {
    content: string;
    source: string;
    tags: string[];
  };
}

export const saveKnowledgeTool = tool(
  async ({ content, source, tags }) => {
    try {
      const interruptValue: HITLInterruptValue = {
        type: "verification",
        description: "Approve saving new knowledge to the database?",
        value: {
          content,
          source,
          tags,
        },
        actions: [
          { id: "accept", label: "Approve", type: "approve" },
          { id: "reject", label: "Reject", type: "reject" },
          { id: "edit", label: "Edit", type: "edit" },
        ],
        schema: {
          type: "object",
          properties: {
            content: { type: "string" },
            source: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["content", "source", "tags"],
        },
      };

      const userResponse = await interrupt<
        HITLInterruptValue,
        HITLResumeResponse
      >(interruptValue);

      if (userResponse.action === "reject") {
        return "Knowledge saving was rejected.";
      }

      const finalArgs =
        userResponse.action === "edit" && userResponse.value
          ? userResponse.value
          : { content, source, tags };

      await indexDocument(finalArgs.content, {
        source: finalArgs.source,
        tags: finalArgs.tags,
      });
      return `Successfully saved knowledge from source: ${finalArgs.source}`;
    } catch (error: unknown) {
      console.error("Error saving knowledge:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return `Failed to save knowledge: ${errorMessage}`;
    }
  },
  {
    name: "save_knowledge",
    description:
      "Saves verified knowledge to the database for future retrieval.",
    schema: z.object({
      content: z.string().describe("The knowledge content to save"),
      source: z
        .string()
        .describe(
          "The source of this information (e.g., 'user correction', 'manual entry')",
        ),
      tags: z.array(z.string()).describe("Tags to categorize this information"),
    }),
  },
);
