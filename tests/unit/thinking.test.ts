import { describe, it, expect } from "@jest/globals";
import { attempt_reasoning } from "../../src/agents/supervisor/tools/thinking.js";

describe("attempt_reasoning tool", () => {
  it("should have the correct name and description", () => {
    expect(attempt_reasoning.name).toBe("attempt_reasoning");
    expect(attempt_reasoning.description).toBe(
      "Record a thought or reasoning step.",
    );
  });

  it("should record a thought", async () => {
    const input = { thought: "Test reasoning step" };
    const result = await attempt_reasoning.invoke(input);
    expect(result).toBe("Thought recorded.");
  });
});
