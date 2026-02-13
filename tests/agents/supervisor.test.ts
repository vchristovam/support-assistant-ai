import { describe, it, expect } from "@jest/globals";
import { createSupportSupervisor } from "../../src/agents/supervisor/index.js";
import { createSupervisorSystemPrompt } from "../../src/prompts/supervisor.js";

describe("Supervisor Agent", () => {
  describe("createSupervisorSystemPrompt", () => {
    const prompt = createSupervisorSystemPrompt({
      date: new Date().toISOString(),
      activeAgents: [
        "databricks",
        "dynatrace",
        "knowledge",
        "operations",
        "human_interface",
        "health_check",
        "filesystem",
      ],
    });

    it("should reference databricks", () => {
      expect(prompt).toContain('name="databricks"');
    });

    it("should reference dynatrace", () => {
      expect(prompt).toContain('name="dynatrace"');
    });

    it("should reference knowledge", () => {
      expect(prompt).toContain('name="knowledge"');
    });

    it("should reference operations", () => {
      expect(prompt).toContain('name="operations"');
    });
  });

  describe("createSupportSupervisor", () => {
    it("should be a function", () => {
      expect(typeof createSupportSupervisor).toBe("function");
    });
  });
});
