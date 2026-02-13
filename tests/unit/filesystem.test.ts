import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// Define mock types
interface Tool {
  name: string;
  description?: string;
  inputSchema?: any;
}

interface ListToolsResult {
  tools: Tool[];
}

interface CallToolResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

// Mock dependencies
const mockListTools = jest.fn<() => Promise<ListToolsResult>>();
const mockCallTool = jest.fn<(args: any) => Promise<CallToolResult>>();

const mockMcpClient = {
  listTools: mockListTools,
  callTool: mockCallTool,
};

const mockMcpServiceInstance = {
  start: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  getClient: jest.fn().mockReturnValue(mockMcpClient),
};

const mockMcpService = {
  getInstance: jest.fn().mockReturnValue(mockMcpServiceInstance),
};

// Mock the McpClientService module
jest.unstable_mockModule("../../src/services/mcpClient.js", () => ({
  McpClientService: mockMcpService,
}));

// Import the module under test
const { getFilesystemTools } =
  await import("../../src/agents/filesystem/tools.js");

describe("Filesystem Tools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and map tools correctly", async () => {
    // Mock listTools response
    mockListTools.mockResolvedValue({
      tools: [
        {
          name: "read_file",
          description: "Read file",
          inputSchema: { type: "object" },
        },
        {
          name: "write_file",
          description: "Write file",
          inputSchema: { type: "object" },
        },
        {
          name: "list_directory",
          description: "List dir",
          inputSchema: { type: "object" },
        },
        {
          name: "other_tool",
          description: "Ignore me",
          inputSchema: { type: "object" },
        },
      ],
    });

    const tools = await getFilesystemTools();

    expect(mockMcpServiceInstance.start).toHaveBeenCalled();
    expect(mockMcpServiceInstance.getClient).toHaveBeenCalled();
    expect(mockListTools).toHaveBeenCalled();

    // specific filtering
    expect(tools).toHaveLength(3);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("write_file");
    expect(toolNames).toContain("list_directory");
    expect(toolNames).not.toContain("other_tool");
  });

  it("should call underlying MCP tool when invoked", async () => {
    // Setup tools
    mockListTools.mockResolvedValue({
      tools: [{ name: "read_file", description: "Read file", inputSchema: {} }],
    });

    // Setup callTool response
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "file content" }],
      isError: false,
    });

    const tools = await getFilesystemTools();
    const readFileTool = tools.find((t) => t.name === "read_file");

    expect(readFileTool).toBeDefined();

    const result = await readFileTool?.invoke({ path: "/tmp/test.txt" });

    expect(mockCallTool).toHaveBeenCalledWith({
      name: "read_file",
      arguments: { path: "/tmp/test.txt" },
    });
    expect(result).toBe("file content");
  });

  it("should handle MCP errors", async () => {
    // Setup tools
    mockListTools.mockResolvedValue({
      tools: [{ name: "read_file", description: "Read file", inputSchema: {} }],
    });

    // Setup callTool error response
    mockCallTool.mockResolvedValue({
      content: [{ type: "text", text: "Permission denied" }],
      isError: true,
    });

    const tools = await getFilesystemTools();
    const readFileTool = tools.find((t) => t.name === "read_file");

    // The tool implementation catches the error and throws a new Error
    // "Error executing read_file: MCP Tool Error: Permission denied"
    await expect(
      readFileTool?.invoke({ path: "/root/secret" }),
    ).rejects.toThrow("Permission denied");
  });
});
