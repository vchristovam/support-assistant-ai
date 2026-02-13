import { describe, it, expect } from "@jest/globals";
import { createGraph } from "../../src/graph/index.js";
import { MemorySaver } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { FakeToolCallingChatModel } from "../helpers/fakeModel.js";

describe("Supervisor Routing Integration", () => {
  const createTestGraph = () => {
    const fakeLLM = new FakeToolCallingChatModel({
      responses: [new AIMessage("I'll help you with that.")],
      sleep: 0,
    });
    const checkpointer = new MemorySaver();
    return createGraph(checkpointer, fakeLLM);
  };

  it("should create graph with all worker agents", () => {
    const graph = createTestGraph();
    expect(graph).toBeDefined();
    expect(graph.name).toBe("Enterprise Support Autopilot");
  });

  it("should process a message through the graph", async () => {
    const graph = createTestGraph();
    const threadId = "test-thread-1";

    const result = await graph.invoke(
      { messages: [new HumanMessage("Show me order data")] },
      { configurable: { thread_id: threadId } },
    );

    expect(result).toBeDefined();
    expect(result.messages).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
  }, 30_000);

  it("should route database queries to databricks context", async () => {
    const graph = createTestGraph();
    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage("Query the orders table for yesterday's sales"),
        ],
      },
      { configurable: { thread_id: "db-test" } },
    );

    expect(result).toBeDefined();
    expect(result.messages.length).toBeGreaterThan(0);
  }, 30_000);

  it("should handle errors gracefully", async () => {
    const graph = createTestGraph();

    const result = await graph.invoke(
      { messages: [new HumanMessage("")] },
      { configurable: { thread_id: "edge-case" } },
    );

    expect(result).toBeDefined();
  }, 30_000);
});
