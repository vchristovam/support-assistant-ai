import { describe, it, expect } from "@jest/globals";
import {
  SUPERVISOR_SYSTEM_PROMPT,
  createSupportSupervisor,
} from "../../src/agents/supervisor/index.js";

describe("Supervisor Agent", () => {
  describe("SUPERVISOR_SYSTEM_PROMPT", () => {
    it("should reference databricks_agent", () => {
      expect(SUPERVISOR_SYSTEM_PROMPT).toContain("databricks_agent");
    });

    it("should reference dynatrace_agent", () => {
      expect(SUPERVISOR_SYSTEM_PROMPT).toContain("dynatrace_agent");
    });

    it("should reference knowledge_agent", () => {
      expect(SUPERVISOR_SYSTEM_PROMPT).toContain("knowledge_agent");
    });

    it("should reference operations_agent", () => {
      expect(SUPERVISOR_SYSTEM_PROMPT).toContain("operations_agent");
    });
  });

  describe("createSupportSupervisor", () => {
    it("should be a function", () => {
      expect(typeof createSupportSupervisor).toBe("function");
    });
  });
});
