import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import { AIMessage } from "@langchain/core/messages";
import type { FastifyInstance } from "fastify";
import { FakeToolCallingChatModel } from "../helpers/fakeModel.js";

// Mock environment variables before importing anything else
process.env.SQL_SERVER_HOST = "localhost";
process.env.SQL_SERVER_DATABASE = "testdb";
process.env.SQL_SERVER_USER = "sa";
process.env.SQL_SERVER_PASSWORD = "password";
process.env.SQL_SERVER_ENCRYPT = "true";
process.env.SQL_SERVER_TRUST_CERT = "true";

// Mock mssql
const mockRequest = {
  input: jest.fn<any>().mockReturnThis(),
  query: jest.fn<any>(),
};

const mockPool = {
  connect: jest.fn<any>().mockReturnThis(),
  request: jest.fn<any>().mockReturnValue(mockRequest),
  close: jest.fn<any>().mockResolvedValue(undefined),
  connected: true,
};

jest.mock("mssql", () => {
  return {
    connect: jest.fn<any>().mockResolvedValue(mockPool),
    ConnectionPool: jest.fn<any>().mockImplementation(() => mockPool),
    NVarChar: jest
      .fn<any>()
      .mockImplementation((size: any) => ({ type: "NVarChar", size })),
    UniqueIdentifier: { type: "UniqueIdentifier" },
    Int: { type: "Int" },
    MAX: "MAX",
  };
});

// Import app after mocks
const { createApp } = (await import("../../src/server/app.js")) as any;

describe("SQL Server Flow Integration", () => {
  let app: FastifyInstance;
  let mockLLM: FakeToolCallingChatModel;

  beforeAll(async () => {
    mockLLM = new FakeToolCallingChatModel({
      responses: [new AIMessage("I'll help you with that.")],
      sleep: 0,
    });
    app = await createApp(mockLLM);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should create a thread using SQL Server", async () => {
    const threadId = "test-thread-123";
    const userId = "00000000-0000-0000-0000-000000000001";

    mockRequest.query.mockReset();
    mockRequest.input.mockClear();

    mockRequest.query.mockImplementation((query: string) => {
      if (query.includes("SELECT") && query.includes("FROM threads")) {
        return Promise.resolve({
          recordset: [
            {
              thread_id: threadId,
              user_id: userId,
              title: "Test Thread",
              status: "idle",
              metadata: JSON.stringify({}),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      return Promise.resolve({ recordset: [] });
    });

    mockRequest.query.mockResolvedValueOnce({ recordset: [] });

    const response = await app.inject({
      method: "POST",
      url: "/threads",
      headers: {
        "x-user-id": userId,
      },
      payload: {
        thread_id: threadId,
        metadata: { title: "Test Thread" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.thread_id).toBe(threadId);

    expect(mockRequest.input).toHaveBeenCalledWith(
      "thread_id",
      expect.anything(),
      threadId,
    );
    expect(mockRequest.input).toHaveBeenCalledWith(
      "user_id",
      expect.anything(),
      userId,
    );
    expect(mockRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO threads"),
    );
  });

  it("should retrieve a thread with state from SQL Server", async () => {
    const threadId = "test-thread-456";
    const userId = "00000000-0000-0000-0000-000000000001";

    mockRequest.query.mockReset();
    mockRequest.input.mockClear();

    mockRequest.query.mockImplementation((query: string) => {
      if (query.includes("FROM threads")) {
        return Promise.resolve({
          recordset: [
            {
              thread_id: threadId,
              user_id: userId,
              title: "Test Thread",
              status: "idle",
              metadata: JSON.stringify({}),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      if (query.includes("FROM langgraph_checkpoints")) {
        return Promise.resolve({
          recordset: [
            {
              checkpoint_id: "checkpoint-123",
              checkpoint_data: JSON.stringify({
                v: 1,
                id: "checkpoint-123",
                channel_values: { messages: [] },
                channel_versions: {},
                versions_seen: {},
                pending_sends: [],
              }),
              checkpoint_map: JSON.stringify({}),
              created_at: new Date(),
            },
          ],
        });
      }
      return Promise.resolve({ recordset: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: `/threads/${threadId}`,
      headers: {
        "x-user-id": userId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.thread_id).toBe(threadId);
    expect(body.values).toBeDefined();

    expect(mockRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM threads"),
    );
    expect(mockRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM langgraph_checkpoints"),
    );
  });

  it("should retrieve thread history using SQL Server", async () => {
    const threadId = "test-thread-789";
    const userId = "00000000-0000-0000-0000-000000000001";

    mockRequest.query.mockReset();
    mockRequest.input.mockClear();

    mockRequest.query.mockImplementation((query: string) => {
      if (query.includes("FROM threads")) {
        return Promise.resolve({
          recordset: [
            {
              thread_id: threadId,
              user_id: userId,
              title: "Test Thread",
              status: "idle",
              metadata: JSON.stringify({}),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      if (query.includes("FROM langgraph_checkpoints")) {
        return Promise.resolve({
          recordset: [],
        });
      }
      return Promise.resolve({ recordset: [] });
    });

    const response = await app.inject({
      method: "GET",
      url: `/threads/${threadId}/history`,
      headers: {
        "x-user-id": userId,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(Array.isArray(body)).toBe(true);

    expect(mockRequest.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM langgraph_checkpoints"),
    );
  });

  it("should persist checkpoint during a run using SQL checkpointer", async () => {
    const threadId = "test-thread-runs";
    const userId = "00000000-0000-0000-0000-000000000002";

    mockRequest.query.mockReset();
    mockRequest.input.mockClear();

    mockRequest.query.mockImplementation((query: string) => {
      if (query.includes("FROM threads")) {
        return Promise.resolve({
          recordset: [
            {
              thread_id: threadId,
              user_id: userId,
              title: "Test Thread",
              status: "idle",
              metadata: JSON.stringify({}),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });
      }
      if (query.includes("INSERT INTO langgraph_checkpoints")) {
        return Promise.resolve({
          recordset: [{ checkpoint_id: "checkpoint-new" }],
        });
      }
      if (query.includes("UPDATE threads")) {
        return Promise.resolve({
          recordset: [{ affectedRows: 1 }],
        });
      }
      return Promise.resolve({ recordset: [] });
    });

    const response = await app.inject({
      method: "POST",
      url: `/threads/${threadId}/runs`,
      headers: {
        "x-user-id": userId,
      },
      payload: {
        assistant_id: "test-assistant",
        input: {
          messages: [{ type: "human", content: "Tell me a joke" }],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.run_id).toBeDefined();

    // Wait for background execution to hit checkpointer
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const checkpointCall = mockRequest.query.mock.calls.find(
      (call: any) =>
        typeof call[0] === "string" &&
        call[0].includes("INSERT INTO langgraph_checkpoints"),
    );
    expect(checkpointCall).toBeDefined();
  }, 10000);
});
