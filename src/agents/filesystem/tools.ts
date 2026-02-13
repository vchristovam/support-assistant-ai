import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { McpClientService } from "../../services/mcpClient.js";

interface McpTextContent {
  type: "text";
  text: string;
}

interface McpOtherContent {
  type: string;
  text?: string;
}

type McpContent = McpTextContent | McpOtherContent;

interface McpCallToolResult {
  content: McpContent[];
  isError?: boolean;
}

const TOOLS_CONFIG = [
  {
    name: "read_file",
    description: "Read the complete contents of a file from the filesystem.",
    schema: z.object({
      path: z.string().describe("The absolute path to the file to read"),
    }),
  },
  {
    name: "write_file",
    description:
      "Write content to a file at the specified path. Overwrites existing files.",
    schema: z.object({
      path: z.string().describe("The absolute path to the file to write"),
      content: z.string().describe("The content to write to the file"),
    }),
  },
  {
    name: "list_directory",
    description: "List files and directories in a given path.",
    schema: z.object({
      path: z.string().describe("The absolute path to the directory to list"),
    }),
  },
];

/**
 * Fetches filesystem tools from the MCP server and maps them to LangChain tools.
 *
 * @returns An array of LangChain tools for filesystem operations.
 */
export const getFilesystemTools = () => {
  const mcpService = McpClientService.getInstance();
  // Service will be started on first tool call

  const mappedTools = [];

  for (const config of TOOLS_CONFIG) {
    const toolInstance = tool(
      async (args) => {
        try {
          await mcpService.start();
          const client = mcpService.getClient();

          const result = (await client.callTool({
            name: config.name,
            arguments: args,
          })) as unknown as McpCallToolResult;

          if (result.isError) {
            const errorContent = result.content
              .filter((c): c is McpTextContent => c.type === "text")
              .map((c) => c.text)
              .join("\n");
            throw new Error(`MCP Tool Error: ${errorContent}`);
          }

          const textContent = result.content
            .filter((c): c is McpTextContent => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          return textContent;
        } catch (error) {
          throw new Error(
            `Error executing ${config.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      },
      {
        name: config.name,
        description: config.description,
        schema: config.schema,
      },
    );

    mappedTools.push(toolInstance);
  }

  return mappedTools;
};
