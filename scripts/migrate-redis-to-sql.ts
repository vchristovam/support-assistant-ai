import { Redis } from "ioredis";
import sql from "mssql";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000000";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SQL_CONFIG: sql.config = {
  server: process.env.SQL_SERVER_HOST || "localhost",
  port: parseInt(process.env.SQL_SERVER_PORT || "1433", 10),
  database: process.env.SQL_SERVER_DATABASE || "SupportAssistant",
  user: process.env.SQL_SERVER_USER || "sa",
  password: process.env.SQL_SERVER_PASSWORD || "password",
  options: {
    encrypt: process.env.SQL_SERVER_ENCRYPT === "true",
    trustServerCertificate: process.env.SQL_SERVER_TRUST_CERT === "true",
  },
};

interface MigrationReport {
  totalThreads: number;
  migratedThreads: number;
  skippedThreads: number;
  failedThreads: number;
  totalCheckpoints: number;
  totalMessages: number;
  errors: string[];
}

const report: MigrationReport = {
  totalThreads: 0,
  migratedThreads: 0,
  skippedThreads: 0,
  failedThreads: 0,
  totalCheckpoints: 0,
  totalMessages: 0,
  errors: [],
};

function extractMessages(checkpoint: any): any[] {
  if (!checkpoint || !checkpoint.channel_values) return [];

  const messages = checkpoint.channel_values.messages;
  if (Array.isArray(messages)) {
    return messages;
  }

  // Handle case where messages might be in a different field or nested
  if (
    checkpoint.channel_values.history &&
    Array.isArray(checkpoint.channel_values.history)
  ) {
    return checkpoint.channel_values.history;
  }

  return [];
}

function mapRole(message: any): string {
  const type = message._getType?.() || message.type || "";
  switch (type.toLowerCase()) {
    case "human":
    case "user":
      return "user";
    case "ai":
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    case "tool":
      return "tool";
    default:
      if (message.id && Array.isArray(message.id)) {
        const className = message.id[message.id.length - 1];
        if (className === "HumanMessage") return "user";
        if (className === "AIMessage") return "assistant";
        if (className === "SystemMessage") return "system";
        if (className === "ToolMessage") return "tool";
      }
      return "user";
  }
}

function extractContent(message: any): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return JSON.stringify(message.content);
  }
  if (message.kwargs && typeof message.kwargs.content === "string") {
    return message.kwargs.content;
  }
  return String(message.content || "");
}

async function migrate() {
  console.log("Starting migration from Redis to SQL Server...");

  const redis = new Redis(REDIS_URL);
  let pool: sql.ConnectionPool | null = null;

  try {
    pool = await sql.connect(SQL_CONFIG);
    console.log("Connected to SQL Server.");

    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = '${MOCK_USER_ID}')
        BEGIN
          INSERT INTO users (user_id, username, email)
          VALUES ('${MOCK_USER_ID}', 'migration_user', 'migration@system.local')
        END
      `);
    } catch (e) {
      console.warn(
        "Could not verify/create mock user in 'users' table. Skipping user check.",
      );
    }

    console.log("Scanning Redis for threads...");
    const keys = await redis.keys("checkpoint:*:*:*");

    const threadMap = new Map<string, string[]>();
    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length >= 4) {
        const threadId = parts[1];
        if (!threadMap.has(threadId)) {
          threadMap.set(threadId, []);
        }
        threadMap.get(threadId)!.push(key);
      }
    }

    report.totalThreads = threadMap.size;
    console.log(`Found ${threadMap.size} threads in Redis.`);

    for (const [threadId, checkpointKeys] of threadMap.entries()) {
      try {
        const threadCheck = await pool
          .request()
          .input("threadId", sql.NVarChar(255), threadId)
          .query("SELECT thread_id FROM threads WHERE thread_id = @threadId");

        if (threadCheck.recordset.length > 0) {
          console.log(
            `Thread ${threadId} already exists in SQL Server. Skipping.`,
          );
          report.skippedThreads++;
          continue;
        }

        console.log(`Migrating thread: ${threadId}`);

        const checkpointsData: any[] = [];
        for (const key of checkpointKeys) {
          const rawData = await (redis as any).send_command(
            "JSON.GET",
            key,
            "$",
          );
          if (!rawData) continue;

          const jsonDoc = JSON.parse(rawData as string);
          const data = Array.isArray(jsonDoc) ? jsonDoc[0] : jsonDoc;

          if (data && data.checkpoint) {
            checkpointsData.push({
              key,
              data: data.checkpoint,
              metadata: data.metadata || {},
              checkpointNs: data.checkpoint_ns || "",
              checkpointId: data.checkpoint_id || key.split(":")[3],
            });
          }
        }

        if (checkpointsData.length === 0) {
          console.warn(
            `No valid checkpoints found for thread ${threadId}. Skipping.`,
          );
          report.skippedThreads++;
          continue;
        }

        const latestCheckpoint = checkpointsData[checkpointsData.length - 1];
        const title =
          latestCheckpoint.metadata?.title || `Migrated Thread ${threadId}`;

        await pool
          .request()
          .input("thread_id", sql.NVarChar(255), threadId)
          .input("user_id", sql.UniqueIdentifier, MOCK_USER_ID)
          .input("title", sql.NVarChar(500), title)
          .input("status", sql.NVarChar(50), "idle")
          .input(
            "metadata",
            sql.NVarChar(sql.MAX),
            JSON.stringify(latestCheckpoint.metadata || {}),
          )
          .query(
            "INSERT INTO threads (thread_id, user_id, title, status, metadata) VALUES (@thread_id, @user_id, @title, @status, @metadata)",
          );

        for (const cp of checkpointsData) {
          await pool
            .request()
            .input("checkpoint_id", sql.UniqueIdentifier, uuidv4())
            .input("thread_id", sql.NVarChar(255), threadId)
            .input("checkpoint_ns", sql.NVarChar(255), cp.checkpointNs)
            .input(
              "checkpoint_data",
              sql.NVarChar(sql.MAX),
              JSON.stringify(cp.data),
            )
            .input(
              "checkpoint_map",
              sql.NVarChar(sql.MAX),
              JSON.stringify(cp.metadata),
            )
            .query(
              "INSERT INTO langgraph_checkpoints (checkpoint_id, thread_id, checkpoint_ns, checkpoint_data, checkpoint_map) VALUES (@checkpoint_id, @thread_id, @checkpoint_ns, @checkpoint_data, @checkpoint_map)",
            );

          report.totalCheckpoints++;
        }

        const messages = extractMessages(latestCheckpoint.data);
        for (const msg of messages) {
          const role = mapRole(msg);
          const content = extractContent(msg);
          const toolCalls = msg.tool_calls || msg.kwargs?.tool_calls;
          const toolCallId = msg.tool_call_id || msg.kwargs?.tool_call_id;

          await pool
            .request()
            .input("message_id", sql.UniqueIdentifier, uuidv4())
            .input("thread_id", sql.NVarChar(255), threadId)
            .input("role", sql.NVarChar(50), role)
            .input("content", sql.NVarChar(sql.MAX), content)
            .input(
              "tool_calls",
              sql.NVarChar(sql.MAX),
              toolCalls ? JSON.stringify(toolCalls) : null,
            )
            .input("tool_call_id", sql.NVarChar(255), toolCallId || null)
            .query(
              "INSERT INTO conversations (message_id, thread_id, role, content, tool_calls, tool_call_id) VALUES (@message_id, @thread_id, @role, @content, @tool_calls, @tool_call_id)",
            );

          report.totalMessages++;
        }

        report.migratedThreads++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to migrate thread ${threadId}: ${errMsg}`);
        report.failedThreads++;
        report.errors.push(`Thread ${threadId}: ${errMsg}`);
      }
    }

    console.log("\nMigration Complete!");
    console.log("-------------------");
    console.log(`Total Threads:      ${report.totalThreads}`);
    console.log(`Migrated:           ${report.migratedThreads}`);
    console.log(`Skipped (existing): ${report.skippedThreads}`);
    console.log(`Failed:             ${report.failedThreads}`);
    console.log(`Total Checkpoints:  ${report.totalCheckpoints}`);
    console.log(`Total Messages:     ${report.totalMessages}`);

    if (report.errors.length > 0) {
      console.log("\nErrors Encountered:");
      report.errors.slice(0, 10).forEach((e) => console.log(`- ${e}`));
      if (report.errors.length > 10)
        console.log(`... and ${report.errors.length - 10} more.`);
    }
  } catch (err) {
    console.error("Critical migration error:", err);
    process.exit(1);
  } finally {
    await redis.quit();
    if (pool) await pool.close();
  }
}

migrate();
