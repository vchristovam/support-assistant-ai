import { v4 as uuidv4 } from "uuid";
import type { ThreadRepository } from "../../repositories/threadRepository.js";
import type { ConversationRepository } from "../../repositories/conversationRepository.js";

/**
 * Conversation domain object
 * Clean abstraction without LangGraph internals
 */
export interface Conversation {
  conversation_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

/**
 * Message domain object
 */
export interface Message {
  message_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: Record<string, unknown>;
  tool_call_id?: string;
  created_at: string;
}

/**
 * Create conversation request
 */
export interface CreateConversationRequest {
  conversation_id?: string;
  title?: string;
}

/**
 * Generate a unique conversation ID with prefix
 */
const generateConversationId = (): string => `conv-${uuidv4()}`;

/**
 * Create a new conversation
 * @param request - Create conversation request
 * @param threadRepo - Thread repository for persistence
 * @param userId - User ID for authorization
 * @returns Created conversation
 */
export const createConversation = async (
  request: CreateConversationRequest,
  threadRepo: ThreadRepository,
  userId: string,
): Promise<Conversation> => {
  const conversationId = request.conversation_id || generateConversationId();

  try {
    // Check if conversation already exists
    const existingThread = await threadRepo.getThread(conversationId, userId);

    if (existingThread) {
      // Return existing conversation
      return {
        conversation_id: existingThread.thread_id,
        user_id: existingThread.user_id,
        title: existingThread.title || "New Conversation",
        created_at: existingThread.created_at.toISOString(),
        updated_at: existingThread.updated_at.toISOString(),
      };
    }

    // Create conversation in database via thread repository
    const thread = await threadRepo.createThread({
      thread_id: conversationId,
      user_id: userId,
      title: request.title || "New Conversation",
      metadata: {},
    });

    return {
      conversation_id: thread.thread_id,
      user_id: thread.user_id,
      title: thread.title || "New Conversation",
      created_at: thread.created_at.toISOString(),
      updated_at: thread.updated_at.toISOString(),
    };
  } catch (error) {
    console.error(`Error creating conversation ${conversationId}:`, error);
    throw error;
  }
};

/**
 * Get a conversation by ID
 * @param conversationId - Conversation ID
 * @param threadRepo - Thread repository
 * @param userId - User ID for authorization
 * @returns Conversation or null if not found
 */
export const getConversation = async (
  conversationId: string,
  threadRepo: ThreadRepository,
  userId: string,
): Promise<Conversation | null> => {
  try {
    const thread = await threadRepo.getThread(conversationId, userId);

    if (!thread) {
      return null;
    }

    return {
      conversation_id: thread.thread_id,
      user_id: thread.user_id,
      title: thread.title || "New Conversation",
      created_at: thread.created_at.toISOString(),
      updated_at: thread.updated_at.toISOString(),
    };
  } catch (error) {
    console.error(`Error getting conversation ${conversationId}:`, error);
    return null;
  }
};

/**
 * Get conversation messages
 * @param conversationId - Conversation ID
 * @param conversationRepo - Conversation repository
 * @param userId - User ID for authorization
 * @param threadRepo - Thread repository for authorization check
 * @returns Array of messages or null if conversation not found
 */
export const getMessages = async (
  conversationId: string,
  conversationRepo: ConversationRepository,
  userId: string,
  threadRepo: ThreadRepository,
): Promise<Message[] | null> => {
  try {
    // First verify the conversation exists and user has access
    const thread = await threadRepo.getThread(conversationId, userId);

    if (!thread) {
      return null;
    }

    // Get messages from conversation repository
    const messages = await conversationRepo.getThreadHistory(conversationId);

    // Convert messages to domain objects
    return messages.map((msg) => ({
      message_id: msg.message_id,
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      created_at: msg.created_at.toISOString(),
    }));
  } catch (error) {
    console.error(
      `Error getting messages for conversation ${conversationId}:`,
      error,
    );
    return null;
  }
};
