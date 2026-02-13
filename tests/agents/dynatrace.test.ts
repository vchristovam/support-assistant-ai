import { describe, it, expect } from "@jest/globals";
import { dqlTool } from "../../src/agents/dynatrace/tools/dqlTool.js";
import { problemsTool } from "../../src/agents/dynatrace/tools/problemsTool.js";
import { createDynatraceAgent } from "../../src/agents/dynatrace/index.js";

describe("Dynatrace Agent", () => {
  describe("Tools", () => {
    it("should have a dql tool named 'execute_dql'", () => {
      expect(dqlTool.name).toBe("execute_dql");
    });

    it("should have a problems tool named 'get_problems'", () => {
      expect(problemsTool.name).toBe("get_problems");
    });

    it("should return mock results when dql tool is invoked", async () => {
      const result = await dqlTool.invoke({ query: "fetch logs" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("records");
      expect(parsed.recordCount).toBe(2);
    });

    it("should return mock results when problems tool is invoked", async () => {
      const result = await problemsTool.invoke({ timeframe: "-2h" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("problems");
      expect(parsed.totalCount).toBe(2);
    });
  });

  describe("Agent", () => {
    it("should create a React agent", () => {
      const mockLlm: any = {
        bindTools: () => mockLlm,
        withConfig: () => mockLlm,
        invoke: () => Promise.resolve({ content: "test" }),
      };
      const agent = createDynatraceAgent(mockLlm);
      expect(agent).toBeDefined();
    });
  });
});
