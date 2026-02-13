import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import sql from "mssql";
import {
  createRedisCheckpointer,
  createSqlServerCheckpointer,
} from "../graph/index.js";
import type { SqlServerConfig } from "../checkpointer/sqlserver.js";
import { config } from "../config/index.js";
import { ThreadRepository } from "../repositories/threadRepository.js";
import { ConversationRepository } from "../repositories/conversationRepository.js";

export interface Infrastructure {
  checkpointer: BaseCheckpointSaver;
  threadRepository?: ThreadRepository;
  conversationRepository?: ConversationRepository;
  sqlPool?: sql.ConnectionPool;
}

export const initializeInfrastructure = async (): Promise<Infrastructure> => {
  // Initialize checkpointer: SQL Server if configured, then Redis, otherwise MemorySaver
  let checkpointer: BaseCheckpointSaver;
  try {
    if (
      config.sqlServer.server &&
      config.sqlServer.database &&
      config.sqlServer.user &&
      config.sqlServer.password
    ) {
      checkpointer = await createSqlServerCheckpointer(
        config.sqlServer as SqlServerConfig,
      );
      console.log("Connected to SQL Server for state persistence");
    } else if (config.redis.url) {
      checkpointer = await createRedisCheckpointer(config.redis.url);
      console.log("Connected to Redis for state persistence");
    } else {
      checkpointer = new MemorySaver();
      console.log(
        "Using MemorySaver for state persistence (no SQL Server or Redis configured)",
      );
    }
  } catch (error) {
    console.error(
      "Failed to initialize checkpointer, falling back to MemorySaver:",
      error,
    );
    checkpointer = new MemorySaver();
  }

  // Initialize SQL Server connection pool and repositories
  let threadRepository: ThreadRepository | undefined;
  let conversationRepository: ConversationRepository | undefined;
  let sqlPool: sql.ConnectionPool | undefined;

  try {
    const sqlConfig = config.sqlServer;
    if (
      sqlConfig.server &&
      sqlConfig.database &&
      sqlConfig.user &&
      sqlConfig.password
    ) {
      sqlPool = await sql.connect({
        server: sqlConfig.server,
        port: sqlConfig.port,
        database: sqlConfig.database,
        user: sqlConfig.user,
        password: sqlConfig.password,
        options: {
          encrypt: sqlConfig.options.encrypt,
          trustServerCertificate: sqlConfig.options.trustServerCertificate,
        },
        pool: {
          min: 0,
          max: 10,
        },
      });
      threadRepository = new ThreadRepository(sqlPool);
      conversationRepository = new ConversationRepository(sqlPool);
      console.log("Connected to SQL Server for thread persistence");
    } else {
      console.log(
        "SQL Server not configured, using in-memory fallback for thread metadata",
      );
    }
  } catch (error) {
    console.error(
      "Failed to initialize SQL Server connection, using fallback:",
      error,
    );
  }

  return {
    checkpointer,
    threadRepository,
    conversationRepository,
    sqlPool,
  };
};
