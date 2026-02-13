import { describe, it, expect, jest } from "@jest/globals";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { 
  wrapToolWithErrorHandling, 
  isTokenLimitError, 
  handleTokenLimitError 
} from "./errorHandling.js";

describe("wrapToolWithErrorHandling", () => {
  it("should wrap function and return result on success", async () => {
    const mockFn = jest.fn<(args: { arg: string }) => Promise<string>>().mockResolvedValue("success");
    const wrapped = wrapToolWithErrorHandling(mockFn);
    
    const result = await wrapped({ arg: "test" });
    
    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledWith({ arg: "test" });
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");
    
    const wrapped = wrapToolWithErrorHandling(mockFn, { retries: 2 });
    
    const result = await wrapped({});
    
    expect(result).toBe("success");
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("should return fallback value if all retries fail", async () => {
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(new Error("fail"));
    const wrapped = wrapToolWithErrorHandling(mockFn, { 
      retries: 1, 
      fallback: "fallback-value" 
    });
    
    const result = await wrapped({});
    
    expect(result).toBe("fallback-value");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should throw last error if all retries fail and no fallback is provided", async () => {
    const error1 = new Error("fail 1");
    const error2 = new Error("fail 2");
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2);
    
    const wrapped = wrapToolWithErrorHandling(mockFn, { retries: 1 });
    
    await expect(wrapped({})).rejects.toThrow("fail 2");
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should log error if logError option is true", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => { return; });
    const error = new Error("test error");
    const mockFn = jest.fn<() => Promise<string>>().mockRejectedValue(error);
    
    const wrapped = wrapToolWithErrorHandling(mockFn, { logError: true });
    
    await expect(wrapped({})).rejects.toThrow(error);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error in tool execution"),
      error
    );
    
    consoleSpy.mockRestore();
  });

  it("should respect retryDelay if provided", async () => {
    const startTime = Date.now();
    const mockFn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");
    
    const wrapped = wrapToolWithErrorHandling(mockFn, { 
      retries: 1, 
      retryDelay: 100 
    });
    
    const result = await wrapped({});
    const duration = Date.now() - startTime;
    
    expect(result).toBe("success");
    expect(duration).toBeGreaterThanOrEqual(100);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});

describe("isTokenLimitError", () => {
  it("should return true for token limit error messages", () => {
    expect(isTokenLimitError(new Error("Token limit reached"))).toBe(true);
    expect(isTokenLimitError(new Error("Context length exceeded"))).toBe(true);
    expect(isTokenLimitError(new Error("Maximum context length is 4096"))).toBe(true);
  });

  it("should return true for specific error codes", () => {
    expect(isTokenLimitError({ code: "context_length_exceeded" })).toBe(true);
    expect(isTokenLimitError({ status: 429 })).toBe(true);
    expect(isTokenLimitError({ statusCode: 429 })).toBe(true);
  });

  it("should return false for unrelated errors", () => {
    expect(isTokenLimitError(new Error("Network error"))).toBe(false);
    expect(isTokenLimitError(new Error("Authentication failed"))).toBe(false);
    expect(isTokenLimitError({ code: "not_found" })).toBe(false);
    expect(isTokenLimitError(null)).toBe(false);
  });
});

describe("handleTokenLimitError", () => {
  const systemMsg = new SystemMessage("You are a helpful assistant");
  const msg1 = new HumanMessage("Hello");
  const msg2 = new AIMessage("Hi there!");
  const msg3 = new HumanMessage("How are you?");
  const msg4 = new AIMessage("I'm good, thanks!");

  it("should not truncate if messages are within limit", () => {
    const messages = [systemMsg, msg1, msg2];
    const result = handleTokenLimitError(messages, 5);
    expect(result).toEqual(messages);
  });

  it("should truncate older messages and keep the specified number", () => {
    const messages = [msg1, msg2, msg3, msg4];
    const result = handleTokenLimitError(messages, 2);
    expect(result).toEqual([msg3, msg4]);
  });

  it("should preserve the system message even when truncating", () => {
    const messages = [systemMsg, msg1, msg2, msg3, msg4];
    const result = handleTokenLimitError(messages, 2);
    expect(result).toEqual([systemMsg, msg3, msg4]);
  });

  it("should not duplicate system message if it's already in the kept window", () => {
    const messages = [systemMsg, msg1, msg2];
    const result = handleTokenLimitError(messages, 3);
    expect(result).toEqual([systemMsg, msg1, msg2]);
  });
});
