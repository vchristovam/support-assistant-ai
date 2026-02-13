import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockConnect = jest.fn().mockImplementation(async () => {});
const mockCloseClient = jest.fn();
const mockCloseTransport = jest.fn();
const mockMkdir = jest.fn().mockImplementation(async () => {});
const mockExistsSync = jest.fn();

const MockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  close: mockCloseClient,
}));

const MockStdioClientTransport = jest.fn().mockImplementation(() => ({
  close: mockCloseTransport,
}));

jest.unstable_mockModule("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: MockClient,
}));

jest.unstable_mockModule("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: MockStdioClientTransport,
}));

jest.unstable_mockModule("fs", () => ({
  default: {
    existsSync: mockExistsSync,
    promises: {
      mkdir: mockMkdir,
    },
  },
}));

const { McpClientService } = await import("../../src/services/mcpClient.js");

describe("McpClientService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (McpClientService as any).instance = undefined;
  });

  it("should be a singleton", () => {
    const instance1 = McpClientService.getInstance();
    const instance2 = McpClientService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should start client and transport", async () => {
    const instance = McpClientService.getInstance();

    mockExistsSync.mockReturnValue(true);

    await instance.start();

    expect(mockExistsSync).toHaveBeenCalledTimes(2);
    expect(MockStdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.stringContaining("mcp-server-filesystem"),
        args: [expect.stringContaining("workspace")],
      }),
    );
    expect(MockClient).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
  });

  it("should create workspace if missing", async () => {
    const instance = McpClientService.getInstance();

    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    await instance.start();

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("workspace"),
      { recursive: true },
    );
  });

  it("should throw if binary missing", async () => {
    const instance = McpClientService.getInstance();

    mockExistsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);

    await expect(instance.start()).rejects.toThrow(
      "MCP Server binary not found",
    );
  });

  it("should return client via getClient()", async () => {
    const instance = McpClientService.getInstance();
    mockExistsSync.mockReturnValue(true);
    await instance.start();

    const client = instance.getClient();
    expect(client).toBeDefined();
    expect(client).toHaveProperty("connect");
  });

  it("should throw if getClient called before start", () => {
    const instance = McpClientService.getInstance();
    expect(() => instance.getClient()).toThrow("MCP Client not connected");
  });

  it("should stop client and transport", async () => {
    const instance = McpClientService.getInstance();
    mockExistsSync.mockReturnValue(true);
    await instance.start();

    await instance.stop();

    expect(mockCloseClient).toHaveBeenCalled();
    expect(mockCloseTransport).toHaveBeenCalled();

    expect(() => instance.getClient()).toThrow("MCP Client not connected");
  });
});
