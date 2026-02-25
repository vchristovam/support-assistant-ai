import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import type { FastifyInstance } from "fastify";
import { AIMessage } from "@langchain/core/messages";
import { createApp } from "../../src/server/app.js";
import { FakeToolCallingChatModel } from "../helpers/fakeModel.js";

describe("Run interrupt endpoint", () => {
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

  it("POST /threads/:thread_id/runs/:run_id/interrupt should return 404 for unknown thread", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/threads/non-existent-thread/runs/run-1/interrupt",
      payload: { decision: "approve" },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("NotFound");
  });

  it("POST /threads/:thread_id/runs/:run_id/interrupt should return 400 for missing command payload", async () => {
    const createResponse = await app.inject({
      method: "POST",
      url: "/threads",
      payload: {},
    });
    const { thread_id } = JSON.parse(createResponse.body);

    const response = await app.inject({
      method: "POST",
      url: `/threads/${thread_id}/runs/run-1/interrupt`,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe("BadRequest");
  });
});
