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
});
