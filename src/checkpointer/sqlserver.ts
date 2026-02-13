import sql from "mssql";
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
  type CheckpointListOptions,
  type PendingWrite,
  type ChannelVersions,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";

/**
 * Configuration options for SQL Server connection.
 */
export interface SqlServerConfig {
  /** SQL Server hostname or IP address */
  server: string;
  /** SQL Server port (default: 1433) */
  port?: number;
  /** Database name */
  database: string;
  /** Username for authentication */
  user: string;
  /** Password for authentication */
  password: string;
  /** Connection options */
  options?: {
    /** Enable encryption (default: true) */
    encrypt: boolean;
    /** Trust server certificate (default: false for production) */
    trustServerCertificate: boolean;
  };
  /** Connection pool settings */
  pool?: {
    /** Minimum connections in pool (default: 0) */
    min: number;
    /** Maximum connections in pool (default: 10) */
    max: number;
  };
}

/**
 * SQL Server implementation of BaseCheckpointSaver for LangGraph.
 * Persists graph state checkpoints to SQL Server for conversation continuity.
 *
 * @example
 * ```typescript
 * const checkpointer = new SqlServerCheckpointSaver({
 *   server: process.env.SQL_SERVER_HOST,
 *   database: process.env.SQL_SERVER_DATABASE,
 *   user: process.env.SQL_SERVER_USER,
 *   password: process.env.SQL_SERVER_PASSWORD
 * });
 *
 * // Save checkpoint
 * await checkpointer.put(
 *   { configurable: { thread_id: "thread-123" } },
 *   checkpoint,
 *   { source: "input", step: -1, parents: {} },
 *   {}
 * );
 *
 * // Retrieve checkpoint
 * const checkpoint = await checkpointer.get({
 *   configurable: { thread_id: "thread-123" }
 * });
 * ```
 */
export class SqlServerCheckpointSaver extends BaseCheckpointSaver {
  private pool: sql.ConnectionPool | null = null;
  private readonly sqlConfig: SqlServerConfig;

  /**
   * Creates a new SqlServerCheckpointSaver instance.
   * @param config - SQL Server connection configuration
   * @param serde - Optional serializer for checkpoint data
   */
  constructor(config: SqlServerConfig, serde?: SerializerProtocol) {
    super(serde);
    this.sqlConfig = config;
  }

  /**
   * Initializes the connection pool if not already connected.
   * @returns The connection pool instance
   * @throws Error if connection fails
   */
  private async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    try {
      const poolConfig: sql.config = {
        server: this.sqlConfig.server,
        port: this.sqlConfig.port ?? 1433,
        database: this.sqlConfig.database,
        user: this.sqlConfig.user,
        password: this.sqlConfig.password,
        options: {
          encrypt: this.sqlConfig.options?.encrypt ?? true,
          trustServerCertificate:
            this.sqlConfig.options?.trustServerCertificate ?? false,
        },
        pool: {
          min: this.sqlConfig.pool?.min ?? 0,
          max: this.sqlConfig.pool?.max ?? 10,
        },
      };

      this.pool = await new sql.ConnectionPool(poolConfig).connect();
      return this.pool;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to connect to SQL Server: ${errorMessage}. ` +
          `Please verify your connection configuration and network connectivity.`,
      );
    }
  }

  /**
   * Extracts thread_id from the RunnableConfig.
   * @param config - The runnable configuration
   * @returns The thread ID or undefined if not found
   */
  private getThreadId(config: RunnableConfig): string | undefined {
    const configurable = config.configurable as
      | Record<string, unknown>
      | undefined;
    return configurable?.thread_id as string | undefined;
  }

  /**
   * Extracts checkpoint_ns (namespace) from the RunnableConfig.
   * @param config - The runnable configuration
   * @returns The checkpoint namespace or empty string if not found
   */
  private getCheckpointNs(config: RunnableConfig): string {
    const configurable = config.configurable as
      | Record<string, unknown>
      | undefined;
    return (configurable?.checkpoint_ns as string) ?? "";
  }

  /**
   * Extracts checkpoint_id from the RunnableConfig.
   * @param config - The runnable configuration
   * @returns The checkpoint ID or undefined if not found
   */
  private getCheckpointId(config: RunnableConfig): string | undefined {
    const configurable = config.configurable as
      | Record<string, unknown>
      | undefined;
    return configurable?.checkpoint_id as string | undefined;
  }

  /**
   * Retrieves a checkpoint tuple from SQL Server by thread ID.
   * Returns the most recent checkpoint for the given thread.
   *
   * @param config - RunnableConfig containing thread_id in configurable
   * @returns The checkpoint tuple or undefined if not found
   * @throws Error if database operation fails
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = this.getThreadId(config);
    if (!threadId) {
      throw new Error(
        "Thread ID is required but was not provided in config.configurable.thread_id",
      );
    }

    const checkpointNs = this.getCheckpointNs(config);
    const checkpointId = this.getCheckpointId(config);

    try {
      const pool = await this.getPool();

      const request = pool.request();
      request.input("threadId", sql.NVarChar(255), threadId);
      request.input("checkpointNs", sql.NVarChar(255), checkpointNs);

      let query: string;

      if (checkpointId) {
        // Get specific checkpoint by ID
        request.input("checkpointId", sql.UniqueIdentifier, checkpointId);
        query = `
          SELECT checkpoint_id, checkpoint_data, checkpoint_map, created_at
          FROM langgraph_checkpoints
          WHERE thread_id = @threadId
            AND checkpoint_ns = @checkpointNs
            AND checkpoint_id = @checkpointId
        `;
      } else {
        // Get most recent checkpoint
        query = `
          SELECT TOP 1 checkpoint_id, checkpoint_data, checkpoint_map, created_at
          FROM langgraph_checkpoints
          WHERE thread_id = @threadId
            AND checkpoint_ns = @checkpointNs
          ORDER BY updated_at DESC, created_at DESC
        `;
      }

      const result = await request.query<{
        checkpoint_id: string;
        checkpoint_data: string;
        checkpoint_map: string | null;
        created_at: Date;
      }>(query);

      if (result.recordset.length === 0) {
        return undefined;
      }

      const row = result.recordset[0];

      // Deserialize checkpoint data using serde
      const checkpoint = (await this.serde.loadsTyped(
        "json",
        row.checkpoint_data,
      )) as Checkpoint;

      const metadata = row.checkpoint_map
        ? ((await this.serde.loadsTyped(
            "json",
            row.checkpoint_map,
          )) as CheckpointMetadata)
        : ({} as CheckpointMetadata);

      return {
        config: {
          ...config,
          configurable: {
            ...config.configurable,
            checkpoint_id: row.checkpoint_id,
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
          },
        },
        checkpoint,
        metadata,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to retrieve checkpoint tuple for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Lists checkpoints for a given config and optional filters.
   *
   * @param config - RunnableConfig containing thread_id in configurable
   * @param options - Optional filters
   * @returns AsyncGenerator of checkpoint tuples
   * @throws Error if database operation fails
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = this.getThreadId(config);
    if (!threadId) {
      throw new Error(
        "Thread ID is required but was not provided in config.configurable.thread_id",
      );
    }

    const checkpointNs = this.getCheckpointNs(config);
    const limit = options?.limit ?? 100;

    try {
      const pool = await this.getPool();

      const request = pool.request();
      request.input("threadId", sql.NVarChar(255), threadId);
      request.input("checkpointNs", sql.NVarChar(255), checkpointNs);
      request.input("limit", sql.Int, limit);

      let query = `
        SELECT checkpoint_id, checkpoint_data, checkpoint_map, created_at
        FROM langgraph_checkpoints
        WHERE thread_id = @threadId
          AND checkpoint_ns = @checkpointNs
      `;

      query += `
        ORDER BY updated_at DESC
        OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const result = await request.query<{
        checkpoint_id: string;
        checkpoint_data: string;
        checkpoint_map: string | null;
        created_at: Date;
      }>(query);

      for (const row of result.recordset) {
        const checkpoint = (await this.serde.loadsTyped(
          "json",
          row.checkpoint_data,
        )) as Checkpoint;

        const metadata = row.checkpoint_map
          ? ((await this.serde.loadsTyped(
              "json",
              row.checkpoint_map,
            )) as CheckpointMetadata)
          : ({} as CheckpointMetadata);

        yield {
          config: {
            ...config,
            configurable: {
              ...config.configurable,
              checkpoint_id: row.checkpoint_id,
              thread_id: threadId,
              checkpoint_ns: checkpointNs,
            },
          },
          checkpoint,
          metadata,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to list checkpoints for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Saves a checkpoint to SQL Server.
   * Creates a new record for each checkpoint.
   *
   * @param config - RunnableConfig containing thread_id in configurable
   * @param checkpoint - The checkpoint data to save
   * @param metadata - The checkpoint metadata
   * @param newVersions - New channel versions
   * @returns The RunnableConfig for the saved checkpoint
   * @throws Error if database operation fails
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = this.getThreadId(config);
    if (!threadId) {
      throw new Error(
        "Thread ID is required but was not provided in config.configurable.thread_id",
      );
    }

    const checkpointNs = this.getCheckpointNs(config);

    try {
      const pool = await this.getPool();

      // Serialize checkpoint and metadata using serde
      const [, checkpointBytes] = await this.serde.dumpsTyped(checkpoint);
      const checkpointData =
        typeof checkpointBytes === "string"
          ? checkpointBytes
          : Buffer.from(checkpointBytes).toString("utf-8");

      const [, metadataBytes] = await this.serde.dumpsTyped({
        ...metadata,
        channelVersions: newVersions,
      });
      const metadataData =
        typeof metadataBytes === "string"
          ? metadataBytes
          : Buffer.from(metadataBytes).toString("utf-8");

      const request = pool.request();
      request.input("threadId", sql.NVarChar(255), threadId);
      request.input("checkpointNs", sql.NVarChar(255), checkpointNs);
      request.input("checkpointData", sql.NVarChar(sql.MAX), checkpointData);
      request.input("checkpointMap", sql.NVarChar(sql.MAX), metadataData);

      // Insert new checkpoint record (never update existing)
      const query = `
        INSERT INTO langgraph_checkpoints (thread_id, checkpoint_ns, checkpoint_map, checkpoint_data)
        VALUES (@threadId, @checkpointNs, @checkpointMap, @checkpointData);
        
        SELECT SCOPE_IDENTITY() AS checkpoint_id;
      `;

      const result = await request.query<{ checkpoint_id: string }>(query);
      const newCheckpointId =
        result.recordset[0]?.checkpoint_id ?? checkpoint.id;

      // Return updated config with checkpoint ID
      return {
        ...config,
        configurable: {
          ...config.configurable,
          checkpoint_id: newCheckpointId,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to save checkpoint for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Stores intermediate writes linked to a checkpoint.
   * Used for handling pending writes when a node fails mid-execution.
   *
   * @param config - RunnableConfig containing thread_id and checkpoint_id
   * @param writes - Array of pending writes to store
   * @param taskId - The task ID associated with these writes
   * @throws Error if database operation fails
   */
  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = this.getThreadId(config);
    const checkpointId = this.getCheckpointId(config);

    if (!threadId || !checkpointId) {
      throw new Error("Thread ID and checkpoint ID are required for putWrites");
    }

    try {
      const pool = await this.getPool();

      // For now, we'll store writes as JSON in the checkpoint_map column
      // This is a simplified implementation - a full implementation would have a separate writes table
      const writesData = await Promise.all(
        writes.map(async ([channel, value]) => {
          const [, data] = await this.serde.dumpsTyped(value);
          return {
            channel,
            data:
              typeof data === "string"
                ? data
                : Buffer.from(data).toString("base64"),
            taskId,
          };
        }),
      );

      const request = pool.request();
      request.input("threadId", sql.NVarChar(255), threadId);
      request.input("checkpointId", sql.UniqueIdentifier, checkpointId);
      request.input(
        "writes",
        sql.NVarChar(sql.MAX),
        JSON.stringify(writesData),
      );

      // Store writes in a separate column or table
      // For this implementation, we'll update the checkpoint record with writes info
      const query = `
        UPDATE langgraph_checkpoints
        SET checkpoint_map = JSON_MODIFY(
          ISNULL(checkpoint_map, '{}'),
          '$.writes',
          JSON_QUERY(@writes)
        ),
        updated_at = GETUTCDATE()
        WHERE thread_id = @threadId
          AND checkpoint_id = @checkpointId;
      `;

      await request.query(query);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to save writes for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Deletes all checkpoints and writes associated with a specific thread ID.
   *
   * @param threadId - The thread ID whose checkpoints should be deleted
   * @throws Error if database operation fails
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      const pool = await this.getPool();

      const request = pool.request();
      request.input("threadId", sql.NVarChar(255), threadId);

      const query = `
        DELETE FROM langgraph_checkpoints
        WHERE thread_id = @threadId;
      `;

      await request.query(query);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete thread ${threadId}: ${errorMessage}`);
    }
  }

  /**
   * Closes the connection pool.
   * Should be called when the application shuts down.
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}

/**
 * Factory function to create a SqlServerCheckpointSaver from environment variables.
 * @returns A configured SqlServerCheckpointSaver instance
 * @throws Error if required environment variables are missing
 */
export const createSqlServerCheckpointer = (
  serde?: SerializerProtocol,
): SqlServerCheckpointSaver => {
  const server = process.env.SQL_SERVER_HOST;
  const database = process.env.SQL_SERVER_DATABASE;
  const user = process.env.SQL_SERVER_USER;
  const password = process.env.SQL_SERVER_PASSWORD;

  if (!server || !database || !user || !password) {
    throw new Error(
      "Missing required SQL Server environment variables: " +
        "SQL_SERVER_HOST, SQL_SERVER_DATABASE, SQL_SERVER_USER, SQL_SERVER_PASSWORD",
    );
  }

  return new SqlServerCheckpointSaver(
    {
      server,
      database,
      user,
      password,
      port: process.env.SQL_SERVER_PORT
        ? parseInt(process.env.SQL_SERVER_PORT, 10)
        : undefined,
      options: {
        encrypt: process.env.SQL_SERVER_ENCRYPT !== "false",
        trustServerCertificate: process.env.SQL_SERVER_TRUST_CERT === "true",
      },
    },
    serde,
  );
};

export default SqlServerCheckpointSaver;
