import { describe, it, expect } from "@jest/globals";
import {
  sqlTool,
  genieTool,
  createDatabricksAgent,
} from "../../src/agents/databricks/index.js";

describe("Databricks Agent", () => {
  describe("sqlTool", () => {
    it("should have a tool named 'query_sql'", () => {
      expect(sqlTool.name).toBe("query_sql");
    });

    it("should return mock results when tool is invoked", async () => {
      const result = await sqlTool.invoke({ query: "SELECT * FROM orders" });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("rows");
      expect(parsed.rows.length).toBe(2);
      expect(parsed.rowCount).toBe(2);
    });
  });

  describe("genieTool", () => {
    it("should have a tool named 'query_genie'", () => {
      expect(genieTool.name).toBe("query_genie");
    });

    it("should return mock results when tool is invoked", async () => {
      const result = await genieTool.invoke({
        question: "Why did orders drop?",
      });
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty("answer");
      expect(parsed).toHaveProperty("sql_generated");
      expect(parsed.confidence).toBe(0.85);
    });
  });

  describe("createDatabricksAgent", () => {
    it("should create a React agent", () => {
      const mockLlm: any = {
        bindTools: () => mockLlm,
        withConfig: () => mockLlm,
        invoke: () => Promise.resolve({ content: "test" }),
      };
      const agent = createDatabricksAgent(mockLlm);
      expect(agent).toBeDefined();
    });
  });
});
