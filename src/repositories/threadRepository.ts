import sql from "mssql";
import { v4 as uuidv4 } from "uuid";

export type ThreadStatus = "idle" | "busy" | "interrupted" | "error";

export interface Thread {
  thread_id: string;
  user_id: string;
  title: string | null;
  status: ThreadStatus;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ThreadDbRow {
  thread_id: string;
  user_id: string;
  title: string | null;
  status: string;
  metadata: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Thread creation input
 */
export interface CreateThreadInput {
  thread_id?: string;
  user_id: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Thread update input
 */
export interface UpdateThreadInput {
  title?: string;
  status?: ThreadStatus;
  metadata?: Record<string, unknown>;
}

/**
 * Query options for listing threads
 */
export interface ListThreadsOptions {
  limit?: number;
  offset?: number;
  status?: ThreadStatus;
}

/**
 * Interface for ThreadRepository operations
 */
export interface IThreadRepository {
  /**
   * Creates a new thread
   * @param input - Thread creation data
   * @returns The created thread
   */
  createThread(input: CreateThreadInput): Promise<Thread>;

  /**
   * Retrieves a thread by ID
   * @param threadId - The thread ID
   * @param userId - The user ID for authorization
   * @returns The thread or null if not found
   */
  getThread(threadId: string, userId: string): Promise<Thread | null>;

  /**
   * Retrieves all threads for a user
   * @param userId - The user ID
   * @param options - Query options for pagination and filtering
   * @returns Array of threads
   */
  getThreadsByUser(
    userId: string,
    options?: ListThreadsOptions,
  ): Promise<Thread[]>;

  /**
   * Updates a thread's status
   * @param threadId - The thread ID
   * @param status - The new status
   */
  updateThreadStatus(threadId: string, status: ThreadStatus): Promise<void>;

  /**
   * Updates a thread's title
   * @param threadId - The thread ID
   * @param title - The new title
   */
  updateThreadTitle(threadId: string, title: string): Promise<void>;

  /**
   * Updates a thread's metadata
   * @param threadId - The thread ID
   * @param metadata - The new metadata
   */
  updateThreadMetadata(
    threadId: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Deletes a thread and all associated data
   * @param threadId - The thread ID
   */
  deleteThread(threadId: string): Promise<void>;
}

/**
 * SQL Server implementation of the ThreadRepository.
 * Handles data access for conversation threads.
 *
 * @example
 * ```typescript
 * const pool = new sql.ConnectionPool(config);
 * const threadRepo = new ThreadRepository(pool);
 *
 * // Create a thread
 * const thread = await threadRepo.createThread({
 *   user_id: "user-123",
 *   title: "Support Request"
 * });
 * ```
 */
export class ThreadRepository implements IThreadRepository {
  /**
   * Creates a new ThreadRepository instance
   * @param pool - SQL Server connection pool
   */
  constructor(private pool: sql.ConnectionPool) {}

  /**
   * Creates a new thread in the database
   * @param input - Thread creation data
   * @returns The created thread
   * @throws Error if database operation fails
   */
  async createThread(input: CreateThreadInput): Promise<Thread> {
    const threadId = input.thread_id || `thread-${uuidv4()}`;

    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input("user_id", sql.UniqueIdentifier, input.user_id);
      request.input("title", sql.NVarChar(500), input.title || null);
      request.input("status", sql.NVarChar(50), "idle");
      request.input(
        "metadata",
        sql.NVarChar(sql.MAX),
        JSON.stringify(input.metadata || {}),
      );

      const result = await request.query<ThreadDbRow>(`
        INSERT INTO threads (thread_id, user_id, title, status, metadata)
        VALUES (@thread_id, @user_id, @title, @status, @metadata);

        SELECT
          thread_id,
          user_id,
          title,
          status,
          metadata,
          created_at,
          updated_at
        FROM threads
        WHERE thread_id = @thread_id;
      `);

      if (!result.recordset[0]) {
        throw new Error("Failed to create thread: no record returned");
      }

      return this.parseThread(result.recordset[0]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create thread: ${errorMessage}`);
    }
  }

  /**
   * Retrieves a thread by ID
   * @param threadId - The thread ID
   * @param userId - The user ID for authorization
   * @returns The thread or null if not found
   * @throws Error if database operation fails
   */
  async getThread(threadId: string, userId: string): Promise<Thread | null> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input("user_id", sql.UniqueIdentifier, userId);

      const result = await request.query<ThreadDbRow>(`
        SELECT
          thread_id,
          user_id,
          title,
          status,
          metadata,
          created_at,
          updated_at
        FROM threads
        WHERE thread_id = @thread_id
          AND user_id = @user_id;
      `);

      if (result.recordset.length === 0) {
        return null;
      }

      return this.parseThread(result.recordset[0]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to retrieve thread ${threadId}: ${errorMessage}`);
    }
  }

  /**
   * Retrieves all threads for a user with optional filtering and pagination
   * @param userId - The user ID
   * @param options - Query options for pagination and filtering
   * @returns Array of threads
   * @throws Error if database operation fails
   */
  async getThreadsByUser(
    userId: string,
    options: ListThreadsOptions = {},
  ): Promise<Thread[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    try {
      const request = this.pool.request();
      request.input("user_id", sql.UniqueIdentifier, userId);
      request.input("limit", sql.Int, limit);
      request.input("offset", sql.Int, offset);

      let query = `
        SELECT 
          thread_id,
          user_id,
          title,
          status,
          metadata,
          created_at,
          updated_at
        FROM threads 
        WHERE user_id = @user_id
      `;

      if (options.status) {
        request.input("status", sql.NVarChar(50), options.status);
        query += ` AND status = @status`;
      }

      query += `
        ORDER BY updated_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const result = await request.query<ThreadDbRow>(query);

      return result.recordset.map((row) => this.parseThread(row));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to retrieve threads for user ${userId}: ${errorMessage}`,
      );
    }
  }

  /**
   * Updates a thread's status
   * @param threadId - The thread ID
   * @param status - The new status
   * @throws Error if database operation fails or thread not found
   */
  async updateThreadStatus(
    threadId: string,
    status: ThreadStatus,
  ): Promise<void> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input("status", sql.NVarChar(50), status);

      const result = await request.query<{ affectedRows: number }>(`
        UPDATE threads
        SET status = @status,
            updated_at = GETUTCDATE()
        WHERE thread_id = @thread_id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

      if (!result.recordset[0] || result.recordset[0].affectedRows === 0) {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update thread ${threadId} status: ${errorMessage}`,
      );
    }
  }

  /**
   * Updates a thread's title
   * @param threadId - The thread ID
   * @param title - The new title
   * @throws Error if database operation fails or thread not found
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input("title", sql.NVarChar(500), title);

      const result = await request.query<{ affectedRows: number }>(`
        UPDATE threads
        SET title = @title,
            updated_at = GETUTCDATE()
        WHERE thread_id = @thread_id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

      if (!result.recordset[0] || result.recordset[0].affectedRows === 0) {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update thread ${threadId} title: ${errorMessage}`,
      );
    }
  }

  /**
   * Updates a thread's metadata
   * @param threadId - The thread ID
   * @param metadata - The new metadata (merged with existing)
   * @throws Error if database operation fails or thread not found
   */
  async updateThreadMetadata(
    threadId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);
      request.input(
        "metadata",
        sql.NVarChar(sql.MAX),
        JSON.stringify(metadata),
      );

      const result = await request.query<{ affectedRows: number }>(`
        UPDATE threads
        SET metadata = @metadata,
            updated_at = GETUTCDATE()
        WHERE thread_id = @thread_id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

      if (!result.recordset[0] || result.recordset[0].affectedRows === 0) {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to update thread ${threadId} metadata: ${errorMessage}`,
      );
    }
  }

  /**
   * Deletes a thread and all associated data (cascade delete handles conversations)
   * @param threadId - The thread ID
   * @throws Error if database operation fails
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      const request = this.pool.request();
      request.input("thread_id", sql.NVarChar(255), threadId);

      const result = await request.query<{ affectedRows: number }>(`
        DELETE FROM threads
        WHERE thread_id = @thread_id;

        SELECT @@ROWCOUNT AS affectedRows;
      `);

      if (!result.recordset[0] || result.recordset[0].affectedRows === 0) {
        throw new Error(`Thread ${threadId} not found`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete thread ${threadId}: ${errorMessage}`);
    }
  }

  /**
   * Parses a database row into a Thread object
   */
  private parseThread(row: ThreadDbRow): Thread {
    return {
      thread_id: row.thread_id,
      user_id: row.user_id,
      title: row.title,
      status: row.status as ThreadStatus,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export default ThreadRepository;
