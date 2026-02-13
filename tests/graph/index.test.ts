import { describe, it, expect } from "@jest/globals";
import { MemorySaver } from "@langchain/langgraph";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { createGraph, createRedisCheckpointer } from "../../src/graph/index.js";

describe("Supergraph", () => {
  it("createGraph should be a function", () => {
    expect(typeof createGraph).toBe("function");
  });

  it("createRedisCheckpointer should be a function", () => {
    expect(typeof createRedisCheckpointer).toBe("function");
  });

  it("createGraph should compile with MemorySaver and mock LLM", () => {
    const checkpointer = new MemorySaver();
    const fakeLLM = new FakeListChatModel({ responses: ["ok"] });
    const compiled = createGraph(checkpointer, fakeLLM);
    expect(compiled).toBeDefined();
    expect(compiled.name).toBe("Enterprise Support Autopilot");
  });

  it("compiled graph should expose getGraph", () => {
    const checkpointer = new MemorySaver();
    const fakeLLM = new FakeListChatModel({ responses: ["ok"] });
    const compiled = createGraph(checkpointer, fakeLLM);
    expect(typeof compiled.getGraph).toBe("function");
  }, 10_000);
});
