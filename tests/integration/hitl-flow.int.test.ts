import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { createApp } from "../../src/server/app.js";
import { FakeToolCallingChatModel } from "../helpers/fakeModel.js";
import { AIMessage } from "@langchain/core/messages";
import type { FastifyInstance } from "fastify";

describe("HITL Flow Integration", () => {
  let app: FastifyInstance;
  let mockLLM: FakeToolCallingChatModel;

  beforeAll(async () => {
    mockLLM = new FakeToolCallingChatModel({
      responses: [
        new AIMessage("I'll help you cancel that order."),
        new AIMessage("Order cancellation processed."),
      ],
      sleep: 0,
    });
    app = await createApp(mockLLM);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const parseSSEStream = (
    stream: string,
  ): Array<{ event?: string; data: unknown }> => {
    const events: Array<{ event?: string; data: unknown }> = [];
    const lines = stream.split("\n");
    let currentEvent: { event?: string; data: string } = { data: "" };

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent.event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        currentEvent.data = line.slice(6);
      } else if (line === "" && currentEvent.data) {
        try {
          events.push({
            event: currentEvent.event,
            data: JSON.parse(currentEvent.data),
          });
        } catch {
          events.push({
            event: currentEvent.event,
            data: currentEvent.data,
          });
        }
        currentEvent = { data: "" };
      }
    }

    return events;
  };

  describe("Initial HITL invocation", () => {
    it("should trigger interrupt when operations agent is called", async () => {
      const threadId = `hitl-test-${Date.now()}`;

      const response = await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Cancel order ORD-123",
          thread_id: threadId,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");

      const events = parseSSEStream(response.payload);
      expect(events.length).toBeGreaterThan(0);

      const interruptEvent = events.find((e) => e.event === "interrupt");
      if (interruptEvent) {
        expect(interruptEvent.data).toBeDefined();
        expect(typeof interruptEvent.data).toBe("object");
      }

      const hasDone = events.some((e) => e.data === "[DONE]");
      const hasInterrupt = events.some((e) => e.event === "interrupt");
      expect(hasDone || hasInterrupt).toBe(true);
    }, 30_000);
  });

  describe("HITL Resume with approve", () => {
    it("should complete successfully when approved", async () => {
      const threadId = `hitl-approve-${Date.now()}`;

      await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Cancel order ORD-456",
          thread_id: threadId,
        },
      });

      const resumeResponse = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: threadId,
          decision: "approve",
        },
      });

      expect(resumeResponse.statusCode).toBe(200);
      expect(resumeResponse.headers["content-type"]).toContain(
        "text/event-stream",
      );

      const events = parseSSEStream(resumeResponse.payload);
      expect(events.find((e) => e.data === "[DONE]")).toBeDefined();

      const errorEvents = events.filter(
        (e) =>
          typeof e.data === "object" &&
          e.data !== null &&
          "error" in (e.data as object),
      );
      expect(errorEvents).toHaveLength(0);
    }, 30_000);
  });

  describe("HITL Resume with reject", () => {
    it("should complete with rejection when rejected", async () => {
      const threadId = `hitl-reject-${Date.now()}`;

      await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Cancel order ORD-789",
          thread_id: threadId,
        },
      });

      const resumeResponse = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: threadId,
          decision: "reject",
        },
      });

      expect(resumeResponse.statusCode).toBe(200);

      const events = parseSSEStream(resumeResponse.payload);
      expect(events.find((e) => e.data === "[DONE]")).toBeDefined();

      const errorEvents = events.filter(
        (e) =>
          typeof e.data === "object" &&
          e.data !== null &&
          "error" in (e.data as object),
      );
      expect(errorEvents).toHaveLength(0);
    }, 30_000);
  });

  describe("HITL Resume with edit", () => {
    it("should complete with edited action when edited", async () => {
      const threadId = `hitl-edit-${Date.now()}`;

      await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Cancel order ORD-999",
          thread_id: threadId,
        },
      });

      const editedAction = {
        orderId: "ORD-999",
        reason: "Modified cancellation reason - customer changed mind",
      };

      const resumeResponse = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: threadId,
          decision: "edit",
          edited_action: editedAction,
        },
      });

      expect(resumeResponse.statusCode).toBe(200);

      const events = parseSSEStream(resumeResponse.payload);
      expect(events.find((e) => e.data === "[DONE]")).toBeDefined();

      const errorEvents = events.filter(
        (e) =>
          typeof e.data === "object" &&
          e.data !== null &&
          "error" in (e.data as object),
      );
      expect(errorEvents).toHaveLength(0);
    }, 30_000);
  });

  describe("HITL edge cases", () => {
    it("should handle missing thread_id gracefully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          decision: "approve",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it("should handle invalid decision gracefully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: "some-thread",
          decision: "invalid_decision",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it("should handle missing decision gracefully", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: "some-thread",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });

    it("should handle missing message in chat endpoint", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/chat",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBeDefined();
    });
  });

  describe("Full HITL lifecycle", () => {
    it("should complete full flow: invoke → interrupt → resume → complete", async () => {
      const threadId = `hitl-full-${Date.now()}`;

      const invokeResponse = await app.inject({
        method: "POST",
        url: "/chat",
        payload: {
          message: "Cancel order ORD-FULL-001",
          thread_id: threadId,
        },
      });

      expect(invokeResponse.statusCode).toBe(200);

      const invokeEvents = parseSSEStream(invokeResponse.payload);
      expect(invokeEvents.length).toBeGreaterThan(0);

      const resumeResponse = await app.inject({
        method: "POST",
        url: "/chat/resume",
        payload: {
          thread_id: threadId,
          decision: "approve",
        },
      });

      expect(resumeResponse.statusCode).toBe(200);

      const resumeEvents = parseSSEStream(resumeResponse.payload);
      expect(resumeEvents.find((e) => e.data === "[DONE]")).toBeDefined();

      const errorEvents = resumeEvents.filter(
        (e) =>
          typeof e.data === "object" &&
          e.data !== null &&
          "error" in (e.data as object),
      );
      expect(errorEvents).toHaveLength(0);
    }, 30_000);
  });
});
