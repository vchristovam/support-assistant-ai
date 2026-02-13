import sql from "mssql";
import { v4 as uuidv4 } from "uuid";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  message_id: string;
  thread_id: string;
  role: MessageRole;
  content: string;
  tool_calls?: Record<string, unknown>;
  tool_call_id?: string;
  created_at: Date;
}

export interface MessageInput {
  thread_id: string;
  role: MessageRole;
  content: string;
  tool_calls?: Record<string, unknown>;
  tool_call_id?: string;
}

export interface ListMessagesOptions {
  limit?: number;
  offset?: number;
}

export interface IConversationRepository {
  saveMessage(message: MessageInput): Promise<Message>;
  getMessagesByThread(
    threadId: string,
    options?: ListMessagesOptions,
  ): Promise<Message[]>;
  getThreadHistory(threadId: string): Promise<Message[]>;
  deleteMessage(messageId: string): Promise<void>;
}

interface MessageDbRow {
  message_id: string;
  thread_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: Date;
}

export class ConversationRepository implements IConversationRepository {
  constructor(private pool: sql.ConnectionPool) {}

  async saveMessage(message: MessageInput): Promise<Message> {
    const messageId = uuidv4();

    try {
      const request = this.pool.request();
      request.input("message_id", sql.UniqueIdentifier, messageId);
      request.input("thread_id", sql.NVarChar(255), message.thread_id);
      request.input("role", sql.NVarChar(50), message.role);
      request.input("content", sql.NVarChar(sql.MAX), message.content);
      request.input(
        "tool_calls",
        sql.NVarChar(sql.MAX),
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
      );
      request.input(
        "tool_call_id",
        sql.NVarChar(255),
        message.tool_call_id || null,
      );

      const result = await request.query<MessageDbRow>(`
        INSERT INTO conversations (message_id, thread_id, role, content, tool_calls, tool_call_id)
        VALUES (@message_id, @thread_id, @role, @content, @tool_calls, @tool_call_id);

        SELECT
          message_id,
          thread_id,
          role,
          content,
          tool_calls,
          tool_call_id,
          created_at
        FROM conversations
        WHERE message_id = @message_id;
      `);

      if (!result.recordset[0]) {
        throw new Error("Failed to save message: no record returned");
      }

      return this.parseMessage(result.recordset[0]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to save message: ${errorMessage}`);
    }
  }

  async getMessagesByThread(
    threadId: string,
    options: ListMessagesOptions = {},
  ): Promise<Message[]> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input("limit", sql.Int, limit);
      request.input("offset", sql.Int, offset);

      const result = await request.query<MessageDbRow>(`
        SELECT
          message_id,
          thread_id,
          role,
          content,
          tool_calls,
          tool_call_id,
          created_at
        FROM conversations
        WHERE thread_id = @thread_id
        ORDER BY created_at ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

      return result.recordset.map((row) => this.parseMessage(row));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to retrieve messages for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  async getThreadHistory(threadId: string): Promise<Message[]> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);

      const result = await request.query<MessageDbRow>(`
        SELECT
          message_id,
          thread_id,
          role,
          content,
          tool_calls,
          tool_call_id,
          created_at
        FROM conversations
        WHERE thread_id = @thread_id
        ORDER BY created_at ASC
      `);

      return result.recordset.map((row) => this.parseMessage(row));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to retrieve history for thread ${threadId}: ${errorMessage}`,
      );
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      const request = this.pool.request();
      request.input("message_id", sql.UniqueIdentifier, messageId);

      const result = await request.query<{ affectedRows: number }>(`
        DELETE FROM conversations
        WHERE message_id = @message_id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

      if (!result.recordset[0] || result.recordset[0].affectedRows === 0) {
        throw new Error(`Message ${messageId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete message ${messageId}: ${errorMessage}`);
    }
  }

  private parseMessage(row: MessageDbRow): Message {
    return {
      message_id: row.message_id,
      thread_id: row.thread_id,
      role: row.role as MessageRole,
      content: row.content,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      tool_call_id: row.tool_call_id || undefined,
      created_at: row.created_at,
    };
  }
}

export default ConversationRepository;
