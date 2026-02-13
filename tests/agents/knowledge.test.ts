import { describe, it, expect } from "@jest/globals";
import { vectorSearchTool } from "../../src/agents/knowledge/tools/vectorSearch.js";
import { createKnowledgeAgent } from "../../src/agents/knowledge/index.js";

describe("Knowledge Agent", () => {
  it("should have a tool named 'search_knowledge_base'", () => {
    expect(vectorSearchTool.name).toBe("search_knowledge_base");
  });

  it("should return mock results when tool is invoked", async () => {
    const result = await vectorSearchTool.invoke({ query: "reset password" });
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty("results");
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(parsed.totalResults).toBe(3);
  });

  it("should create a React agent", () => {
    const mockLlm: any = {
      bindTools: () => mockLlm,
      withConfig: () => mockLlm,
      invoke: () => Promise.resolve({ content: "test" }),
    };
    const agent = createKnowledgeAgent(mockLlm);
    expect(agent).toBeDefined();
  });
});
