import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const vectorSearchTool = tool(
  async ({ query }) => {
    if (!query) throw new Error("Query is required");

    const mockResults = {
      results: [
        {
          content:
            "To reset a user password, navigate to Admin > Users > Select User > Reset Password. The user will receive an email with reset instructions.",
          source: "admin-guide.pdf",
          score: 0.95,
        },
        {
          content:
            "Password requirements: minimum 12 characters, at least one uppercase, one number, and one special character.",
          source: "security-policy.md",
          score: 0.87,
        },
        {
          content:
            "If a user is locked out after 5 failed attempts, an admin must manually unlock the account from the Admin panel.",
          source: "troubleshooting-guide.pdf",
          score: 0.82,
        },
      ],
      totalResults: 3,
    };

    return JSON.stringify(mockResults);
  },
  {
    name: "search_knowledge_base",
    description:
      "Search for information in the knowledge base (documents, guides, policies).",
    schema: z.object({
      query: z.string().describe("Search query for the knowledge base"),
      topK: z
        .number()
        .optional()
        .default(3)
        .describe("Number of results to return"),
    }),
  },
);
