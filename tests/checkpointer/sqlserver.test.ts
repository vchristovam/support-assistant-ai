import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type {
  Checkpoint,
  CheckpointMetadata,
} from "@langchain/langgraph-checkpoint";

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

const mockConnectionPool = jest.fn<any>().mockImplementation(() => mockPool);

jest.unstable_mockModule("mssql", () => ({
  ConnectionPool: mockConnectionPool,
  NVarChar: jest.fn((size) => ({ type: "NVarChar", size })),
  UniqueIdentifier: { type: "UniqueIdentifier" },
  Int: { type: "Int" },
  MAX: "MAX",
  default: {
    ConnectionPool: mockConnectionPool,
    NVarChar: jest.fn((size) => ({ type: "NVarChar", size })),
    UniqueIdentifier: { type: "UniqueIdentifier" },
    Int: { type: "Int" },
    MAX: "MAX",
  },
}));

const { SqlServerCheckpointSaver, createSqlServerCheckpointer } =
  await import("../../src/checkpointer/sqlserver.js");

describe("SqlServerCheckpointSaver", () => {
  const config = {
    server: "localhost",
    database: "testdb",
    user: "sa",
    password: "password123",
  };

  let saver: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool.connected = true;
    mockConnectionPool.mockImplementation(() => mockPool);
    saver = new SqlServerCheckpointSaver(config);
  });

  describe("initialization", () => {
    it("should initialize with provided config", () => {
      expect(saver).toBeDefined();
    });

    it("should throw error if connection fails", async () => {
      const errorPool = {
        connect: jest
          .fn<any>()
          .mockRejectedValue(new Error("Connection failed")),
        connected: false,
      };

      mockConnectionPool.mockImplementationOnce(() => errorPool);

      const badSaver = new SqlServerCheckpointSaver(config);
      await expect(
        badSaver.getTuple({ configurable: { thread_id: "1" } }),
      ).rejects.toThrow("Failed to connect to SQL Server: Connection failed");
    });
  });

  describe("getTuple", () => {
    it("should throw error if thread_id is missing", async () => {
      await expect(saver.getTuple({ configurable: {} })).rejects.toThrow(
        "Thread ID is required",
      );
    });

    it("should return undefined if no checkpoint found", async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      const result = await saver.getTuple({
        configurable: { thread_id: "thread-1" },
      });
      expect(result).toBeUndefined();
      expect(mockRequest.input).toHaveBeenCalledWith(
        "threadId",
        expect.anything(),
        "thread-1",
      );
    });

    it("should return checkpoint tuple if found", async () => {
      const mockCheckpoint: Checkpoint = {
        v: 1,
        id: "checkpoint-1",
        ts: "2024-01-01T00:00:00Z",
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      const mockMetadata: CheckpointMetadata = {
        source: "input",
        step: 1,
        parents: {},
      };

      mockRequest.query.mockResolvedValueOnce({
        recordset: [
          {
            checkpoint_id: "checkpoint-1",
            checkpoint_data: JSON.stringify(mockCheckpoint),
            checkpoint_map: JSON.stringify(mockMetadata),
            created_at: new Date(),
          },
        ],
      });

      const result = await saver.getTuple({
        configurable: { thread_id: "thread-1" },
      });

      expect(result).toBeDefined();
      expect(result?.checkpoint).toEqual(mockCheckpoint);
      expect(result?.metadata).toEqual(mockMetadata);
      expect(result?.config.configurable?.checkpoint_id).toBe("checkpoint-1");
    });

    it("should fetch specific checkpoint if checkpoint_id is provided", async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });

      await saver.getTuple({
        configurable: { thread_id: "thread-1", checkpoint_id: "specific-id" },
      });

      expect(mockRequest.input).toHaveBeenCalledWith(
        "checkpointId",
        expect.anything(),
        "specific-id",
      );
      const query = mockRequest.query.mock.calls[0][0] as string;
      expect(query).toContain("checkpoint_id = @checkpointId");
    });
  });

  describe("put", () => {
    it("should save checkpoint and return updated config", async () => {
      const mockCheckpoint: Checkpoint = {
        v: 1,
        id: "new-checkpoint",
        ts: "2024-01-01T00:00:00Z",
        channel_values: {},
        channel_versions: {},
        versions_seen: {},
      };
      const mockMetadata: CheckpointMetadata = {
        source: "loop",
        step: 2,
        parents: {},
      };

      mockRequest.query.mockResolvedValueOnce({
        recordset: [{ checkpoint_id: "generated-id-123" }],
      });

      const resultConfig = await saver.put(
        { configurable: { thread_id: "thread-1" } },
        mockCheckpoint,
        mockMetadata,
        {},
      );

      expect(mockRequest.input).toHaveBeenCalledWith(
        "threadId",
        expect.anything(),
        "thread-1",
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        "checkpointData",
        expect.anything(),
        JSON.stringify(mockCheckpoint),
      );
      expect(resultConfig.configurable?.checkpoint_id).toBe("generated-id-123");
    });

    it("should throw error if thread_id is missing", async () => {
      await expect(
        saver.put({ configurable: {} }, {} as any, {}, {}),
      ).rejects.toThrow("Thread ID is required");
    });

    it("should throw error if save fails", async () => {
      mockRequest.query.mockRejectedValueOnce(new Error("Save failed"));

      await expect(
        saver.put({ configurable: { thread_id: "1" } }, {} as any, {}, {}),
      ).rejects.toThrow("Failed to save checkpoint for thread 1: Save failed");
    });
  });

  describe("putWrites", () => {
    it("should save pending writes", async () => {
      mockRequest.query.mockResolvedValueOnce({});

      await saver.putWrites(
        {
          configurable: {
            thread_id: "thread-1",
            checkpoint_id: "checkpoint-1",
          },
        },
        [["channel1", "value1"]],
        "task-1",
      );

      expect(mockRequest.input).toHaveBeenCalledWith(
        "threadId",
        expect.anything(),
        "thread-1",
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        "checkpointId",
        expect.anything(),
        "checkpoint-1",
      );
      expect(mockRequest.input).toHaveBeenCalledWith(
        "writes",
        expect.anything(),
        expect.stringContaining("channel1"),
      );

      const query = mockRequest.query.mock.calls[0][0] as string;
      expect(query).toContain("UPDATE langgraph_checkpoints");
      expect(query).toContain("JSON_MODIFY");
    });

    it("should throw error if thread_id or checkpoint_id is missing", async () => {
      await expect(
        saver.putWrites(
          { configurable: { thread_id: "1" } } as any,
          [],
          "task-1",
        ),
      ).rejects.toThrow(
        "Thread ID and checkpoint ID are required for putWrites",
      );
    });
  });

  describe("list", () => {
    it("should throw error if thread_id is missing", async () => {
      await expect(saver.list({ configurable: {} }).next()).rejects.toThrow(
        "Thread ID is required",
      );
    });

    it("should throw error if query fails", async () => {
      mockRequest.query.mockRejectedValueOnce(new Error("Query failed"));

      const generator = saver.list({ configurable: { thread_id: "thread-1" } });
      await expect(generator.next()).rejects.toThrow(
        "Failed to list checkpoints for thread thread-1: Query failed",
      );
    });
  });

  describe("deleteThread", () => {
    it("should execute delete query", async () => {
      mockRequest.query.mockResolvedValueOnce({});

      await saver.deleteThread("thread-1");

      expect(mockRequest.input).toHaveBeenCalledWith(
        "threadId",
        expect.anything(),
        "thread-1",
      );
      const query = mockRequest.query.mock.calls[0][0] as string;
      expect(query).toContain("DELETE FROM langgraph_checkpoints");
      expect(query).toContain("WHERE thread_id = @threadId");
    });

    it("should throw error if delete fails", async () => {
      mockRequest.query.mockRejectedValueOnce(new Error("Delete failed"));

      await expect(saver.deleteThread("thread-1")).rejects.toThrow(
        "Failed to delete thread thread-1: Delete failed",
      );
    });
  });

  describe("createSqlServerCheckpointer", () => {
    it("should create instance from env variables", () => {
      const oldEnv = process.env;
      process.env = {
        ...oldEnv,
        SQL_SERVER_HOST: "host",
        SQL_SERVER_DATABASE: "db",
        SQL_SERVER_USER: "user",
        SQL_SERVER_PASSWORD: "pw",
      };

      const instance = createSqlServerCheckpointer();
      expect(instance).toBeDefined();

      process.env = oldEnv;
    });

    it("should throw error if env variables are missing", () => {
      const oldEnv = process.env;
      process.env = {
        ...oldEnv,
        SQL_SERVER_HOST: "",
        SQL_SERVER_DATABASE: "",
        SQL_SERVER_USER: "",
        SQL_SERVER_PASSWORD: "",
      };

      expect(() => createSqlServerCheckpointer()).toThrow(
        "Missing required SQL Server environment variables",
      );

      process.env = oldEnv;
    });
  });

  describe("close", () => {
    it("should close the pool", async () => {
      mockRequest.query.mockResolvedValueOnce({ recordset: [] });
      await saver.getTuple({ configurable: { thread_id: "1" } });

      await saver.close();
      expect(mockPool.close).toHaveBeenCalled();
    });
  });
});
