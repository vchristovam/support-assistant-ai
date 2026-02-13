import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import fs from "fs";

export class McpClientService {
  private static instance: McpClientService;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  private constructor() {
    if (McpClientService.instance) {
      throw new Error("Use McpClientService.getInstance()");
    }
  }

  public static getInstance(): McpClientService {
    if (!McpClientService.instance) {
      McpClientService.instance = new McpClientService();
    }
    return McpClientService.instance;
  }

  public async start(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const workspaceDir = path.resolve(process.cwd(), "workspace");
    const serverPath = path.resolve(
      process.cwd(),
      "node_modules/.bin/mcp-server-filesystem",
    );

    if (!fs.existsSync(workspaceDir)) {
      await fs.promises.mkdir(workspaceDir, { recursive: true });
    }

    if (!fs.existsSync(serverPath)) {
      throw new Error(`MCP Server binary not found at ${serverPath}`);
    }

    this.transport = new StdioClientTransport({
      command: serverPath,
      args: [workspaceDir],
    });

    this.client = new Client(
      {
        name: "SupportAssistant",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    try {
      await this.client.connect(this.transport);
      this.isConnected = true;
    } catch (error) {
      console.error("Failed to connect to MCP server:", error);
      await this.stop();
      throw error;
    }
  }

  public getClient(): Client {
    if (!this.client || !this.isConnected) {
      throw new Error("MCP Client not connected. Call start() first.");
    }
    return this.client;
  }

  public async stop(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error("Error closing MCP client:", error);
      }
      this.client = null;
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        void error;
      }
      this.transport = null;
    }

    this.isConnected = false;
  }
}
