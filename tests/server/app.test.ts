import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import type { FastifyInstance } from "fastify";
import { AIMessage } from "@langchain/core/messages";
import { createApp } from "../../src/server/app.js";
import { FakeToolCallingChatModel } from "../helpers/fakeModel.js";

describe("Fastify Server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const llm = new FakeToolCallingChatModel({
      responses: [new AIMessage("Test response")],
      sleep: 0,
    });
    app = await createApp(llm);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health should return ok", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
  });

  it("GET /info should return server metadata", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/info",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.version).toBeDefined();
    expect(body.flags).toBeDefined();
  });

  it("POST /threads should create a new thread", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/threads",
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

  it("GET /threads should list threads for the current user", async () => {
    const userA = "user-a";
    const userB = "user-b";

    await app.inject({
      method: "POST",
      url: "/threads",
      headers: { "x-user-id": userA },
      payload: { metadata: { label: "a-1" } },
    });
    await app.inject({
      method: "POST",
      url: "/threads",
      headers: { "x-user-id": userA },
      payload: { metadata: { label: "a-2" } },
    });
    await app.inject({
      method: "POST",
      url: "/threads",
      headers: { "x-user-id": userB },
      payload: { metadata: { label: "b-1" } },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/threads?limit=10&offset=0",
      headers: { "x-user-id": userA },
    });

    expect(listResponse.statusCode).toBe(200);
    const body = JSON.parse(listResponse.body);
    expect(Array.isArray(body.threads)).toBe(true);
    expect(body.threads.length).toBe(2);
    expect(
      body.threads.every(
        (thread: { metadata?: { label?: string } }) =>
          thread.metadata?.label?.startsWith("a-"),
      ),
    ).toBe(true);
  });

  it("POST /threads/search should return an array", async () => {
    const userId = "search-user";
    await app.inject({
      method: "POST",
      url: "/threads",
      headers: { "x-user-id": userId },
      payload: { metadata: { feature: "search" } },
    });

    const response = await app.inject({
      method: "POST",
      url: "/threads/search",
      headers: { "x-user-id": userId },
      payload: {
        limit: 10,
        offset: 0,
        metadata: { feature: "search" },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("GET /threads/:thread_id should return thread", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: { metadata: { user_id: "user-123" } },
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const getResponse = await app.inject({
      method: "GET",
      url: `/threads/${thread_id}`,
    });

    expect(getResponse.statusCode).toBe(200);
    const body = JSON.parse(getResponse.body);
    expect(body.thread_id).toBe(thread_id);
    expect(body.metadata.user_id).toBe("user-123");
    expect(body.status).toBe("idle");
  });

  it("GET /threads/:thread_id/state should return state shape", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const stateResponse = await app.inject({
      method: "GET",
      url: `/threads/${thread_id}/state`,
    });

    expect(stateResponse.statusCode).toBe(200);
    const body = JSON.parse(stateResponse.body);
    expect(body.values).toBeDefined();
    expect(Array.isArray(body.next)).toBe(true);
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  it("GET /threads/:thread_id/history should return an array", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const historyResponse = await app.inject({
      method: "GET",
      url: `/threads/${thread_id}/history`,
    });

    expect(historyResponse.statusCode).toBe(200);
    const body = JSON.parse(historyResponse.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /threads/:thread_id/history should return an array", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const historyResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/history`,
      payload: { limit: 10 },
    });

    expect(historyResponse.statusCode).toBe(200);
    const body = JSON.parse(historyResponse.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /threads/:thread_id/runs should create a run", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const runResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs`,
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
      },
    });

    expect(runResponse.statusCode).toBe(200);
    const run = JSON.parse(runResponse.body);
    expect(run.run_id).toMatch(/^run-/);
    expect(run.thread_id).toBe(thread_id);
    expect(run.assistant_id).toBe("agent");
  });

  it("POST /threads/:thread_id/runs/stream should return SSE stream", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const streamResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs/stream`,
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
        stream_mode: ["messages", "values", "events"],
      },
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers["content-type"]).toContain(
      "text/event-stream",
    );
    expect(streamResponse.body).toContain("event: metadata");
  }, 30_000);

  it("OPTIONS /threads/:thread_id/runs/stream should return CORS preflight headers", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const response = await app.inject({
      method: "OPTIONS",
      url: `/threads/${thread_id}/runs/stream`,
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,authorization,x-user-id",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain(
      "content-type",
    );
    expect(response.headers["access-control-expose-headers"]).toContain(
      "Content-Location",
    );
  });

  it("POST /threads/:thread_id/runs/stream should include CORS headers when origin is present", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const streamResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs/stream`,
      headers: {
        origin: "http://localhost:5173",
      },
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
      },
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers["access-control-allow-origin"]).toBe("*");
    expect(streamResponse.headers["access-control-expose-headers"]).toContain(
      "Content-Location",
    );
  }, 30_000);

  it("POST /threads/:thread_id/runs/:run_id/cancel should return run", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const runResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs`,
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
      },
    });
    const run = JSON.parse(runResponse.body);

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs/${run.run_id}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    const canceled = JSON.parse(cancelResponse.body);
    expect(canceled.run_id).toBe(run.run_id);
  });

  it("GET /threads/:thread_id/runs/:run_id/join should return run", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const runResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs`,
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
      },
    });
    const run = JSON.parse(runResponse.body);

    const joinResponse = await app.inject({
      method: "GET",
      url: `/threads/${thread_id}/runs/${run.run_id}/join`,
    });

    expect(joinResponse.statusCode).toBe(200);
    const joined = JSON.parse(joinResponse.body);
    expect(joined.run_id).toBe(run.run_id);
  });

  it("GET /threads/:thread_id/runs/:run_id/stream should return SSE stream", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const runResponse = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs`,
      payload: {
        assistant_id: "agent",
        input: {
          messages: [{ type: "human", content: "hello" }],
        },
      },
    });
    const run = JSON.parse(runResponse.body);

    const streamResponse = await app.inject({
      method: "GET",
      url: `/threads/${thread_id}/runs/${run.run_id}/stream`,
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers["content-type"]).toContain(
      "text/event-stream",
    );
    expect(streamResponse.body).toContain("event: metadata");
  });
});
