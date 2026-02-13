import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockStreamResumeEvents = jest.fn();
const mockStreamRunEvents = jest.fn();

jest.unstable_mockModule("../../src/server/stream.js", () => ({
  streamChatEvents: jest.fn(),
  streamResumeEvents: mockStreamResumeEvents,
  streamRunEvents: mockStreamRunEvents,
}));

const { createApp } = await import("../../src/server/app.js");

describe("POST /chat/resume", () => {
  beforeEach(() => {
    mockStreamResumeEvents.mockClear();
  });

  it("should return 400 when thread_id is missing", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { decision: "approve" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing required fields",
    });
  });

  it("should return 400 when decision is missing", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing required fields",
    });
  });

  it("should return 400 when both thread_id and decision are missing", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing required fields",
    });
  });

  it("should return 400 when decision is invalid", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "invalid_decision" },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing required fields",
    });
  });

  it("should return 400 for other invalid decision values", async () => {
    const app = await createApp();
    const invalidDecisions = ["accept", "deny", "yes", "no", "", null];

    for (const decision of invalidDecisions) {
      const response = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: { thread_id: "thread-123", decision },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        error: "Missing required fields",
      });
    }
  });

  it("should return 200 with SSE headers when request is valid", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("should have Content-Type: text/event-stream header", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.headers["content-type"]).toContain("text/event-stream");
  });

  it("should have Cache-Control: no-cache header", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.headers["cache-control"]).toBe("no-cache");
  });

  it("should have Connection: keep-alive header", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.headers["connection"]).toBe("keep-alive");
  });

  it("should accept 'approve' as valid decision", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "approved" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("should accept 'reject' as valid decision", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "rejected" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "reject" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("should accept 'edit' as valid decision", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "edited" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "edit" },
    });

    expect(response.statusCode).toBe(200);
  });

  it("should accept optional edited_action parameter", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "edited" })}\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: {
        thread_id: "thread-123",
        decision: "edit",
        edited_action: { command: "modified" },
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("should call streamResumeEvents with correct parameters", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: {
        thread_id: "thread-123",
        decision: "edit",
        edited_action: { command: "modified" },
      },
    });

    expect(mockStreamResumeEvents).toHaveBeenCalledWith(
      "thread-123",
      "edit",
      {
        command: "modified",
      },
      expect.any(Object),
      undefined,
    );
  });

  it("should call streamResumeEvents without edited_action when not provided", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ status: "resumed" })}\n\n`;
    });

    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: {
        thread_id: "thread-456",
        decision: "approve",
      },
    });

    expect(mockStreamResumeEvents).toHaveBeenCalledWith(
      "thread-456",
      "approve",
      undefined,
      expect.any(Object),
      undefined,
    );
  });

  it("should handle stream errors gracefully", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ error: "Resume failed", message: "Test error" })}\n\n`;
      yield `data: [DONE]\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("error");
  });

  it("should stream multiple events", async () => {
    mockStreamResumeEvents.mockImplementation(async function* () {
      yield `data: ${JSON.stringify({ event: "start" })}\n\n`;
      yield `data: ${JSON.stringify({ event: "progress" })}\n\n`;
      yield `data: ${JSON.stringify({ event: "complete" })}\n\n`;
      yield `data: [DONE]\n\n`;
    });

    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat/resume",
      payload: { thread_id: "thread-123", decision: "approve" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"event":"start"');
    expect(response.body).toContain('"event":"progress"');
    expect(response.body).toContain('"event":"complete"');
    expect(response.body).toContain("[DONE]");
  });
});
