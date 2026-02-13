import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { MemorySaver } from "@langchain/langgraph";

const mockStreamEvents = jest.fn();
const checkpointer = new MemorySaver();
const mockGraph = {
  streamEvents: mockStreamEvents,
  stream: mockStreamEvents,
};

jest.unstable_mockModule("../../src/graph/index.js", () => ({
  createGraph: jest.fn(() => mockGraph),
}));

const { streamChatEvents, streamResumeEvents } =
  await import("../../src/server/stream.js");

describe("streamChatEvents", () => {
  beforeEach(() => {
    mockStreamEvents.mockClear();
  });

  it("should yield 'event: interrupt' when stream emits __interrupt__ event", async () => {
    const interruptEvent = {
      event: "__interrupt__",
      data: { type: "approval_required", message: "Need approval" },
    };

    mockStreamEvents.mockImplementation(async function* () {
      yield interruptEvent;
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "test input",
      "thread-123",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toBe(
      `event: interrupt\ndata: ${JSON.stringify(interruptEvent.data)}\n\n`,
    );
  });

  it("should stop streaming after interrupt (no [DONE])", async () => {
    const interruptEvent = {
      event: "__interrupt__",
      data: { type: "hitl_required" },
    };

    mockStreamEvents.mockImplementation(async function* () {
      yield interruptEvent;
      yield { event: "on_chain_end", data: { output: "ignored" } };
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "test input",
      "thread-456",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toContain("event: interrupt");
    expect(results.some((r) => r.includes("[DONE]"))).toBe(false);
  });

  it("should pass through normal events unchanged", async () => {
    const normalEvents = [
      { event: "on_chain_start", data: { name: "agent" } },
      { event: "on_llm_stream", data: { chunk: "Hello" } },
      { event: "on_chain_end", data: { output: "response" } },
    ];

    mockStreamEvents.mockImplementation(async function* () {
      for (const event of normalEvents) {
        yield event;
      }
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "hello",
      "thread-789",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(4);
    expect(results[0]).toBe(`data: ${JSON.stringify(normalEvents[0])}\n\n`);
    expect(results[1]).toBe(`data: ${JSON.stringify(normalEvents[1])}\n\n`);
    expect(results[2]).toBe(`data: ${JSON.stringify(normalEvents[2])}\n\n`);
  });

  it("should emit [DONE] only when no interrupt", async () => {
    const normalEvent = { event: "on_chain_end", data: { output: "done" } };

    mockStreamEvents.mockImplementation(async function* () {
      yield normalEvent;
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "test",
      "thread-abc",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toBe(`data: ${JSON.stringify(normalEvent)}\n\n`);
    expect(results[1]).toBe("data: [DONE]\n\n");
  });

  it("should handle empty stream and emit [DONE]", async () => {
    mockStreamEvents.mockImplementation(async function* () {
      return;
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "test",
      "thread-empty",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toBe("data: [DONE]\n\n");
  });

  it("should handle interrupt with complex data", async () => {
    const complexData = {
      action: "deploy_to_production",
      requires_approval: true,
      details: {
        environment: "prod",
        timestamp: "2024-01-01T00:00:00Z",
      },
    };

    mockStreamEvents.mockImplementation(async function* () {
      yield { event: "__interrupt__", data: complexData };
    });

    const results: string[] = [];
    for await (const chunk of streamChatEvents(
      "deploy",
      "thread-deploy",
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toBe(
      `event: interrupt\ndata: ${JSON.stringify(complexData)}\n\n`,
    );
  });
});

describe("streamResumeEvents", () => {
  it("should return not_implemented status", async () => {
    mockStreamEvents.mockImplementation(async function* () {
      yield { event: "on_chain_end", data: { status: "not_implemented" } };
    });

    const results: string[] = [];
    for await (const chunk of streamResumeEvents(
      "thread-123",
      "approve",
      undefined,
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toContain("not_implemented");
    expect(results[1]).toBe("data: [DONE]\n\n");
  });

  it("should accept optional editedAction parameter", async () => {
    mockStreamEvents.mockImplementation(async function* () {
      yield { event: "on_chain_end", data: { status: "edited" } };
    });

    const results: string[] = [];
    for await (const chunk of streamResumeEvents(
      "thread-123",
      "edit",
      {
        action: "modified action",
      },
      checkpointer,
    )) {
      results.push(chunk);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toContain("edited");
  });
});
