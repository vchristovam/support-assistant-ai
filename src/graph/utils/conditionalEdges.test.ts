/**
 * Tests for conditional edge helpers
 */

import { describe, it, expect } from "@jest/globals";
import {
  createConditionalEdges,
  Conditions,
  type TeamState,
  type ConditionFunction,
  type ConditionTargets,
} from "./conditionalEdges.js";

describe("createConditionalEdges", () => {
  it("should route correctly based on condition result", () => {
    const condition: ConditionFunction<"routeA" | "routeB"> = (state) =>
      state.iterationCount > 5 ? "routeA" : "routeB";

    const targets: ConditionTargets<"routeA" | "routeB"> = {
      routeA: "nodeA",
      routeB: "nodeB",
    };

    const edge = createConditionalEdges(condition, targets);

    const stateOver5: TeamState = {
      messages: [],
      next: "",
      iterationCount: 6,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    const stateUnder5: TeamState = {
      messages: [],
      next: "",
      iterationCount: 3,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(edge(stateOver5)).toBe("nodeA");
    expect(edge(stateUnder5)).toBe("nodeB");
  });

  it("should handle single branch condition", () => {
    const condition: ConditionFunction<"always"> = () => "always";
    const targets: ConditionTargets<"always"> = { always: "destination" };

    const edge = createConditionalEdges(condition, targets);

    const mockState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(edge(mockState)).toBe("destination");
  });
});

describe("Conditions.iterationLimit", () => {
  it("should return 'end' when iteration count exceeds max", () => {
    const condition = Conditions.iterationLimit(5);

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 6,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("end");
  });

  it("should return 'end' when iteration count equals max", () => {
    const condition = Conditions.iterationLimit(5);

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 5,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("end");
  });

  it("should return 'continue' when iteration count is below max", () => {
    const condition = Conditions.iterationLimit(5);

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 3,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("continue");
  });
});

describe("Conditions.hasContent", () => {
  it("should return 'has_content' when field has truthy value", () => {
    const condition = Conditions.hasContent("finalReport");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "This is a report",
    };

    expect(condition(state)).toBe("has_content");
  });

  it("should return 'empty' when field is empty string", () => {
    const condition = Conditions.hasContent("finalReport");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("empty");
  });

  it("should return 'empty' when field is undefined", () => {
    const condition = Conditions.hasContent("finalReport");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: undefined as unknown as string,
    };

    expect(condition(state)).toBe("empty");
  });

  it("should return 'has_content' for non-empty array", () => {
    const condition = Conditions.hasContent("researchNotes");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: ["note1", "note2"],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("has_content");
  });

  it("should return 'empty' for empty array", () => {
    const condition = Conditions.hasContent("researchNotes");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("empty");
  });
});

describe("Conditions.isComplete", () => {
  it("should return 'complete' when field equals 'complete'", () => {
    const condition = Conditions.isComplete("next");

    const state: TeamState = {
      messages: [],
      next: "complete",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("complete");
  });

  it("should return 'incomplete' when field does not equal 'complete'", () => {
    const condition = Conditions.isComplete("next");

    const state: TeamState = {
      messages: [],
      next: "processing",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("incomplete");
  });

  it("should return 'incomplete' when field is empty", () => {
    const condition = Conditions.isComplete("next");

    const state: TeamState = {
      messages: [],
      next: "",
      iterationCount: 0,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(condition(state)).toBe("incomplete");
  });
});

describe("Complex condition with multiple branches", () => {
  it("should handle multi-branch routing with custom condition", () => {
    type Branch = "error" | "complete" | "pending" | "timeout";

    const customCondition = (state: TeamState): Branch => {
      if (state.iterationCount >= state.maxIterations) return "timeout";
      if (state.agentOutputs["worker"]?.status === "error") return "error";
      if (state.finalReport) return "complete";
      return "pending";
    };

    const targets: ConditionTargets<Branch> = {
      error: "handleError",
      complete: "__end__",
      pending: "continueProcessing",
      timeout: "forceEnd",
    };

    const edge = createConditionalEdges(customCondition, targets);

    const timeoutState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 10,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    const errorState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 5,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {
        worker: { findings: "", completedAt: "", status: "error" },
      },
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    const completeState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 5,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "Final report content",
    };

    const pendingState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 5,
      maxIterations: 10,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(edge(timeoutState)).toBe("forceEnd");
    expect(edge(errorState)).toBe("handleError");
    expect(edge(completeState)).toBe("__end__");
    expect(edge(pendingState)).toBe("continueProcessing");
  });

  it("should combine built-in conditions for complex logic", () => {
    const iterationCheck = Conditions.iterationLimit(5);
    const reportCheck = Conditions.hasContent("finalReport");

    const combinedCondition = (state: TeamState): string => {
      const limitResult = iterationCheck(state);
      const contentResult = reportCheck(state);

      if (limitResult === "end") return "timeout";
      if (contentResult === "has_content") return "done";
      return "continue";
    };

    const targets: ConditionTargets<string> = {
      timeout: "__end__",
      done: "formatOutput",
      continue: "process",
    };

    const edge = createConditionalEdges(combinedCondition, targets);

    const timeoutState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 5,
      maxIterations: 5,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    const doneState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 3,
      maxIterations: 5,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "Report ready",
    };

    const continueState: TeamState = {
      messages: [],
      next: "",
      iterationCount: 3,
      maxIterations: 5,
      requestContext: {},
      agentOutputs: {},
      researchNotes: [],
      startedAt: "",
      lastActivityAt: "",
      maxToolCalls: 50,
      toolCallCount: 0,
      finalReport: "",
    };

    expect(edge(timeoutState)).toBe("__end__");
    expect(edge(doneState)).toBe("formatOutput");
    expect(edge(continueState)).toBe("process");
  });
});
