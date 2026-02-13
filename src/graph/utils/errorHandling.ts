import { BaseMessage } from "@langchain/core/messages";

export interface ErrorHandlingOptions<R> {
  fallback?: R;
  retries?: number;
  logError?: boolean;
  retryDelay?: number;
}

export const wrapToolWithErrorHandling = <T, R>(
  fn: (args: T) => Promise<R>,
  options: ErrorHandlingOptions<R> = {}
) => {
  return async (args: T): Promise<R> => {
    let lastError: any;
    const retries = options.retries || 0;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn(args);
      } catch (error) {
        lastError = error;

        if (options.logError) {
          console.error(`Error in tool execution (attempt ${i + 1}/${retries + 1}):`, error);
        }

        if (i < retries && options.retryDelay) {
          await new Promise(resolve => setTimeout(resolve, options.retryDelay));
        }
      }
    }

    if (options.fallback !== undefined) {
      return options.fallback;
    }

    throw lastError;
  };
};

/**
 * Checks if the error is a token limit / context length exceeded error.
 * @param error The error to check
 * @returns boolean
 */
export const isTokenLimitError = (error: any): boolean => {
  if (!error) return false;

  const message = (error.message || "").toLowerCase();
  const code = error.code || error.status || error.statusCode;

  const keywords = [
    "token",
    "context length",
    "maximum context",
    "context_length_exceeded",
  ];
  const isKeywordMatch = keywords.some((keyword) => message.includes(keyword));

  const isCodeMatch = code === 429 || code === "context_length_exceeded";

  return isKeywordMatch || isCodeMatch;
};

/**
 * Handles token limit errors by truncating messages.
 * Keeps the system prompt (if present) and the last N messages.
 * @param messages Array of BaseMessage
 * @param keepLast Number of messages to keep from the end (default 10)
 * @returns Truncated array of BaseMessage
 */
export const handleTokenLimitError = (
  messages: BaseMessage[],
  keepLast = 10
): BaseMessage[] => {
  if (messages.length <= keepLast) return messages;

  const systemMessage = messages.find((m) => m.getType() === "system");
  const lastMessages = messages.slice(-keepLast);

  if (systemMessage && !lastMessages.includes(systemMessage)) {
    return [systemMessage, ...lastMessages];
  }

  return lastMessages;
};
