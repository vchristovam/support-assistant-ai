import { describe, it, expect } from "@jest/globals";
import { createApp } from "../../src/server/app.js";

describe("Fastify Server", () => {
  it("GET /health should return ok", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
  });

  it("POST /chat without message should return 400", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("POST /chat should return SSE stream", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "hello", thread_id: "test-123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
  }, 30000);

  it("createApp should be a function", () => {
    expect(typeof createApp).toBe("function");
  });
});

describe("Thread Management Endpoints", () => {
  it("POST /api/threads should create a new thread", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { metadata: { assistant_id: "agent" } },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.thread_id).toBeDefined();
    expect(body.thread_id).toMatch(/^thread-/);
    expect(body.created_at).toBeDefined();
    expect(body.updated_at).toBeDefined();
    expect(body.status).toBe("idle");
    expect(body.metadata).toEqual({ assistant_id: "agent" });
    expect(body.values).toEqual({});
    expect(body.interrupts).toEqual({});
  });

  it("POST /api/threads with custom thread_id should use provided ID", async () => {
    const app = await createApp();
    const customId = "thread-custom-123";
    const response = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { thread_id: customId },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.thread_id).toBe(customId);
  });

  it("GET /api/threads/:thread_id should return thread", async () => {
    const app = await createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: { metadata: { user_id: "user-123" } },
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/threads/${thread_id}`,
    });

    expect(getResponse.statusCode).toBe(200);
    const body = JSON.parse(getResponse.body);
    expect(body.thread_id).toBe(thread_id);
    expect(body.metadata.user_id).toBe("user-123");
    expect(body.status).toBe("idle");
  });

  it("GET /api/threads/:thread_id should return 404 for non-existent thread", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/threads/non-existent-thread",
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("NotFound");
  });

  it("GET /api/threads/:thread_id/history should return messages array", async () => {
    const app = await createApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const historyResponse = await app.inject({
      method: "GET",
      url: `/api/threads/${thread_id}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    const body = JSON.parse(historyResponse.body);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages).toEqual([]);
  });

  it("GET /api/threads/:thread_id/history should return 404 for non-existent thread", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/threads/non-existent-thread/history",
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("NotFound");
  });
});
