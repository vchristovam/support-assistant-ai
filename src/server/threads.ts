import { v4 as uuidv4 } from "uuid";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type {
  ThreadRepository,
  ThreadStatus,
} from "../repositories/threadRepository.js";
import type { ConversationRepository } from "../repositories/conversationRepository.js";

/**
 * Metadata interface for thread metadata
 */
export interface Metadata {
  source?: "input" | "loop" | "update" | string;
  step?: number;
  writes?: Record<string, unknown> | null;
  parents?: Record<string, string>;
  assistant_id?: string;
  user_id?: string;
  [key: string]: unknown;
}

/**
 * Interrupt interface for HITL workflows
 */
export interface Interrupt<TValue = unknown> {
  id?: string;
  value?: TValue;
  when?: "during" | string;
  resumable?: boolean;
  ns?: string[];
}

/**
 * Thread interface per LangGraph Platform API spec
 */
export interface Thread<ValuesType = Record<string, unknown>> {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Metadata;
  status: ThreadStatus;
  values: ValuesType;
  interrupts: Record<string, Array<Interrupt>>;
  config?: Config;
  error?: string | Record<string, unknown> | null;
}

/**
 * Config interface for thread configuration
 */
export interface Config {
  tags?: string[];
  recursion_limit?: number;
  configurable?: {
    thread_id?: string | null;
    checkpoint_id?: string | null;
    [key: string]: unknown;
  };
}

/**
 * Create thread request interface
 */
export interface CreateThreadRequest {
  thread_id?: string;
  metadata?: Metadata;
  ifExists?: "raise" | "do_nothing";
}

/**
 * Generate a unique thread ID with prefix
 */
const generateThreadId = (): string => `thread-${uuidv4()}`;

/**
 * Create a new thread
 * @param request - Create thread request
 * @param threadRepo - Thread repository for persistence
 * @param userId - User ID for authorization
 * @returns Created thread
 */
export const createThread = async (
  request: CreateThreadRequest,
  threadRepo: ThreadRepository,
  userId: string,
): Promise<Thread> => {
  const threadId = request.thread_id || generateThreadId();

  try {
    // Check if thread already exists
    const existingThread = await threadRepo.getThread(threadId, userId);

    if (existingThread) {
      if (request.ifExists === "raise") {
        throw new Error(`Thread '${threadId}' already exists`);
      }
      // Return existing thread if ifExists is "do_nothing"
      return {
        thread_id: existingThread.thread_id,
        created_at: existingThread.created_at.toISOString(),
        updated_at: existingThread.updated_at.toISOString(),
        metadata: existingThread.metadata,
        status: existingThread.status,
        values: {},
        interrupts: {},
        config: {
          configurable: {
            thread_id: existingThread.thread_id,
          },
        },
      };
    }

    // Create thread in database
    const thread = await threadRepo.createThread({
      thread_id: threadId,
      user_id: userId,
      title: request.metadata?.title as string | undefined,
      metadata: request.metadata || {},
    });

    return {
      thread_id: thread.thread_id,
      created_at: thread.created_at.toISOString(),
      updated_at: thread.updated_at.toISOString(),
      metadata: thread.metadata,
      status: thread.status,
      values: {},
      interrupts: {},
      config: {
        configurable: {
          thread_id: thread.thread_id,
        },
      },
    };
  } catch (error) {
    console.error(`Error creating thread ${threadId}:`, error);
    throw error;
  }
};

/**
 * Get thread state from checkpointer
 * @param threadId - Thread ID
 * @param checkpointer - State persistence backend
 * @returns Thread state or null if not found
 */
const getThreadState = async (
  threadId: string,
  checkpointer: BaseCheckpointSaver,
): Promise<{
  values: Record<string, unknown>;
  interrupts: Record<string, Array<Interrupt>>;
} | null> => {
  try {
    const config = {
      configurable: {
        thread_id: threadId,
      },
    };

    const checkpoint = await checkpointer.get(config);

    if (!checkpoint) {
      return null;
    }

    // Extract values from checkpoint
    const values = (checkpoint.channel_values as Record<string, unknown>) || {};

    // Check for interrupts in the checkpoint
    // The structure depends on the LangGraph version
    const interrupts: Record<string, Array<Interrupt>> = {};

    // Try to detect interrupt status from checkpoint
    const checkpointData = checkpoint as unknown as Record<string, unknown>;
    if (checkpointData.interrupts) {
      Object.assign(interrupts, checkpointData.interrupts);
    }

    return {
      values,
      interrupts,
    };
  } catch (error) {
    console.error(`Error getting thread state for ${threadId}:`, error);
    return null;
  }
};

/**
 * Get a thread by ID
 * @param threadId - Thread ID
 * @param threadRepo - Thread repository
 * @param userId - User ID for authorization
 * @param checkpointer - Optional state persistence backend for values
 * @returns Thread or null if not found
 */
export const getThread = async (
  threadId: string,
  threadRepo: ThreadRepository,
  userId: string,
  checkpointer?: BaseCheckpointSaver,
): Promise<Thread | null> => {
  try {
    const thread = await threadRepo.getThread(threadId, userId);

    if (!thread) {
      return null;
    }

    // Get state from checkpointer if available
    let values: Record<string, unknown> = {};
    let interrupts: Record<string, Array<Interrupt>> = {};

    if (checkpointer) {
      const state = await getThreadState(threadId, checkpointer);
      if (state) {
        values = state.values;
        interrupts = state.interrupts;
      }
    }

    // Determine status based on checkpoint and database
    let status = thread.status;

    // Check if thread is interrupted based on checkpoint
    if (interrupts && Object.keys(interrupts).length > 0) {
      status = "interrupted";
    }

    return {
      thread_id: thread.thread_id,
      created_at: thread.created_at.toISOString(),
      updated_at: thread.updated_at.toISOString(),
      metadata: thread.metadata,
      status,
      values,
      interrupts,
    };
  } catch (error) {
    console.error(`Error getting thread ${threadId}:`, error);
    return null;
  }
};

/**
 * Get thread message history
 * @param threadId - Thread ID
 * @param conversationRepo - Conversation repository
 * @param userId - User ID for authorization
 * @param threadRepo - Thread repository for authorization check
 * @returns Array of messages or null if thread not found
 */
export const getThreadHistory = async (
  threadId: string,
  conversationRepo: ConversationRepository,
  userId: string,
  threadRepo: ThreadRepository,
): Promise<Array<Record<string, unknown>> | null> => {
  try {
    // First verify the thread exists and user has access
    const thread = await threadRepo.getThread(threadId, userId);

    if (!thread) {
      return null;
    }

    // Get messages from conversation repository
    const messages = await conversationRepo.getThreadHistory(threadId);

    // Convert messages to plain objects
    return messages.map((msg) => ({
      message_id: msg.message_id,
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      created_at: msg.created_at.toISOString(),
    }));
  } catch (error) {
    console.error(`Error getting thread history for ${threadId}:`, error);
    return null;
  }
};

/**
 * Get thread message history from checkpointer (legacy method)
 * @param threadId - Thread ID
 * @param checkpointer - State persistence backend
 * @returns Array of messages or null if thread not found
 */
export const getThreadHistoryFromCheckpointer = async (
  threadId: string,
  checkpointer: BaseCheckpointSaver,
): Promise<Array<Record<string, unknown>> | null> => {
  const state = await getThreadState(threadId, checkpointer);

  if (!state) {
    return null;
  }

  // Extract messages from state values
  const messages = (state.values?.messages as Array<BaseMessage>) || [];

  // Convert messages to plain objects
  return messages.map((msg) => {
    if (typeof msg.toJSON === "function") {
      return msg.toJSON() as unknown as Record<string, unknown>;
    }
    // Fallback for messages that don't have toJSON
    return {
      type: msg.getType(),
      content: msg.content,
      id: msg.id,
      ...((msg.additional_kwargs as Record<string, unknown>) || {}),
    };
  });
};

/**
 * Update thread status
 * @param threadId - Thread ID
 * @param status - New status
 * @param threadRepo - Thread repository
 */
export const updateThreadStatus = async (
  threadId: string,
  status: ThreadStatus,
  threadRepo?: ThreadRepository,
): Promise<void> => {
  try {
    if (threadRepo) {
      await threadRepo.updateThreadStatus(threadId, status);
    } else {
      console.log(
        `Thread repository not available, skipping status update for thread ${threadId} to ${status}`,
      );
    }
  } catch (error) {
    console.error(`Error updating thread status for ${threadId}:`, error);
    throw error;
  }
};

/**
 * Update thread metadata
 * @param threadId - Thread ID
 * @param metadata - New metadata
 * @param threadRepo - Thread repository
 */
export const updateThreadMetadata = async (
  threadId: string,
  metadata: Metadata,
  threadRepo: ThreadRepository,
): Promise<void> => {
  try {
    await threadRepo.updateThreadMetadata(threadId, metadata);
  } catch (error) {
    console.error(`Error updating thread metadata for ${threadId}:`, error);
    throw error;
  }
};
