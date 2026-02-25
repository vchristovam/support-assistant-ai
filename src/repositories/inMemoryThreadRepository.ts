import { v4 as uuidv4 } from "uuid";
import type {
  CreateThreadInput,
  IThreadRepository,
  ListThreadsOptions,
  Thread,
  ThreadStatus,
} from "./threadRepository.js";

/**
 * In-memory ThreadRepository implementation for local development and tests.
 * Data is process-local and non-persistent.
 */
export class InMemoryThreadRepository implements IThreadRepository {
  private readonly threads = new Map<string, Thread>();

  /**
   * Creates a thread in memory.
   * If the same thread_id already exists for the same user, returns it.
   */
  async createThread(input: CreateThreadInput): Promise<Thread> {
    const threadId = input.thread_id || `thread-${uuidv4()}`;
    const existing = this.threads.get(threadId);

    if (existing) {
      if (existing.user_id !== input.user_id) {
        throw new Error(`Thread ${threadId} already exists for another user`);
      }
      return existing;
    }

    const now = new Date();
    const thread: Thread = {
      thread_id: threadId,
      user_id: input.user_id,
      title: input.title || null,
      status: "idle",
      metadata: input.metadata || {},
      created_at: now,
      updated_at: now,
    };

    this.threads.set(threadId, thread);
    return thread;
  }

  /**
   * Retrieves a thread by ID and user ownership.
   */
  async getThread(threadId: string, userId: string): Promise<Thread | null> {
    const thread = this.threads.get(threadId);
    if (!thread || thread.user_id !== userId) {
      return null;
    }
    return thread;
  }

  /**
   * Retrieves all user threads with optional filtering and pagination.
   */
  async getThreadsByUser(
    userId: string,
    options: ListThreadsOptions = {},
  ): Promise<Thread[]> {
    const filtered = Array.from(this.threads.values())
      .filter((thread) => thread.user_id === userId)
      .filter((thread) => !options.status || thread.status === options.status)
      .sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());

    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Updates thread status.
   */
  async updateThreadStatus(
    threadId: string,
    status: ThreadStatus,
  ): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    thread.status = status;
    thread.updated_at = new Date();
  }

  /**
   * Updates thread title.
   */
  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    thread.title = title;
    thread.updated_at = new Date();
  }

  /**
   * Updates thread metadata.
   */
  async updateThreadMetadata(
    threadId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    thread.metadata = metadata;
    thread.updated_at = new Date();
  }

  /**
   * Deletes a thread.
   */
  async deleteThread(threadId: string): Promise<void> {
    if (!this.threads.delete(threadId)) {
      throw new Error(`Thread ${threadId} not found`);
    }
  }
}
