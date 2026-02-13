import { describe, it, expect } from "@jest/globals";
import { apiWriteTool } from "../../src/agents/operations/tools/apiWriteTool.js";
import { createOperationsAgent } from "../../src/agents/operations/index.js";

describe("Operations Agent", () => {
  describe("apiWriteTool", () => {
    it("should have the name 'request_order_cancellation'", () => {
      expect(apiWriteTool.name).toBe("request_order_cancellation");
    });

    it("should have a description", () => {
      expect(apiWriteTool.description).toBeDefined();
      expect(apiWriteTool.description.length).toBeGreaterThan(0);
    });

    it("should have orderId and reason in the schema", () => {
      const schema = apiWriteTool.schema;
      expect(schema).toBeDefined();
      expect(schema.shape).toHaveProperty("orderId");
      expect(schema.shape).toHaveProperty("reason");
    });
  });

  describe("createOperationsAgent", () => {
    it("should be a function", () => {
      expect(typeof createOperationsAgent).toBe("function");
    });
  });
});
