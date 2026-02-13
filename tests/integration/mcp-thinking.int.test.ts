import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { attempt_reasoning } from "../../src/agents/supervisor/tools/thinking.js";
import { getFilesystemTools } from "../../src/agents/filesystem/tools.js";
import { McpClientService } from "../../src/services/mcpClient.js";

describe("MCP Thinking and Filesystem Integration", () => {
  const workspaceDir = path.resolve(process.cwd(), "workspace");
  const testFileName = "test-mcp-file.txt";
  const testContent = "Hello MCP World!";

  beforeAll(async () => {
    // Ensure workspace directory exists and is clean
    if (fs.existsSync(workspaceDir)) {
      await fs.promises.rm(workspaceDir, { recursive: true, force: true });
    }
    await fs.promises.mkdir(workspaceDir, { recursive: true });

    // Start MCP Client
    const mcpService = McpClientService.getInstance();
    await mcpService.start();
  });

  afterAll(async () => {
    // Stop MCP Client
    const mcpService = McpClientService.getInstance();
    await mcpService.stop();

    // Clean up workspace
    if (fs.existsSync(workspaceDir)) {
      await fs.promises.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  describe("Thinking Tool", () => {
    it("Test Case 1: 'Think before you act' (Verify trace contains thought)", async () => {
      const consoleSpy = jest
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const thought = "I need to check the file system.";

      const result = await attempt_reasoning.invoke({ thought });

      expect(result).toBe("Thought recorded.");
      expect(consoleSpy).toHaveBeenCalledWith(`[Reasoning]: ${thought}`);

      consoleSpy.mockRestore();
    });
  });

  describe("Filesystem Tools", () => {
    const tools = getFilesystemTools();
    const toolsMap = Object.fromEntries(tools.map((t) => [t.name, t]));

    it("Test Case 2: 'Write to file' (Verify file creation in ./workspace)", async () => {
      const writeFileTool = toolsMap["write_file"];
      expect(writeFileTool).toBeDefined();

      const filePath = path.join(workspaceDir, testFileName);

      await writeFileTool.invoke({
        path: filePath,
        content: testContent,
      });

      // Verify file exists on disk
      expect(fs.existsSync(filePath)).toBe(true);
      const content = await fs.promises.readFile(filePath, "utf-8");
      expect(content).toBe(testContent);
    }, 10000);

    it("Test Case 3: 'Read from file' (Verify content retrieval)", async () => {
      const readFileTool = toolsMap["read_file"];
      expect(readFileTool).toBeDefined();

      const filePath = path.join(workspaceDir, testFileName);

      const content = await readFileTool.invoke({
        path: filePath,
      });

      expect(content).toBe(testContent);
    }, 10000);

    it("Test Case 4: 'Security check' (Try to access /etc/passwd or similar -> Fail)", async () => {
      const readFileTool = toolsMap["read_file"];
      expect(readFileTool).toBeDefined();

      // Attempt to read /etc/passwd (or generic sensitive file depending on OS, assuming Linux environment from logs)
      // The MCP server should reject this as it is outside the allowed workspace
      const forbiddenPath = "/etc/passwd";

      await expect(
        readFileTool.invoke({
          path: forbiddenPath,
        }),
      ).rejects.toThrow();
    }, 10000);
  });
});
