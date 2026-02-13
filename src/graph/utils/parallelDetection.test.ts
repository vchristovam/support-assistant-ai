import { describe, it, expect } from "@jest/globals";
import { analyzeRequest, planExecution } from "./parallelDetection.js";

describe("parallelDetection", () => {
  describe("analyzeRequest", () => {
    it("should detect parallelizable subtasks with 'and'", () => {
      const request = "Check the logs and restart the server";
      const analysis = analyzeRequest(request);
      expect(analysis.isParallelizable).toBe(true);
      expect(analysis.independentSubtasks).toContain("Check the logs");
      expect(analysis.independentSubtasks).toContain("restart the server");
    });

    it("should detect parallelizable subtasks with 'also'", () => {
      const request = "Check the database also update the config";
      const analysis = analyzeRequest(request);
      expect(analysis.isParallelizable).toBe(true);
      expect(analysis.independentSubtasks).toContain("Check the database");
      expect(analysis.independentSubtasks).toContain("update the config");
    });

    it("should detect parallelizable subtasks with bullet points", () => {
      const request = "- Task 1\n- Task 2\n* Task 3";
      const analysis = analyzeRequest(request);
      expect(analysis.isParallelizable).toBe(true);
      expect(analysis.independentSubtasks).toEqual(["Task 1", "Task 2", "Task 3"]);
    });

    it("should detect parallelizable subtasks with numbered lists", () => {
      const request = "1. First task\n2. Second task";
      const analysis = analyzeRequest(request);
      expect(analysis.isParallelizable).toBe(true);
      expect(analysis.independentSubtasks).toEqual(["First task", "Second task"]);
    });

    it("should not mark single task as parallelizable", () => {
      const request = "Just do this one thing";
      const analysis = analyzeRequest(request);
      expect(analysis.isParallelizable).toBe(false);
      expect(analysis.independentSubtasks.length).toBeLessThanOrEqual(1);
    });
  });

  describe("planExecution", () => {
    it("should create a single batch for independent tasks", () => {
      const analysis = {
        isParallelizable: true,
        independentSubtasks: ["Task A", "Task B"],
        dependencies: {},
      };
      const plan = planExecution(analysis);
      expect(plan.batches).toHaveLength(1);
      expect(plan.batches[0]).toContain("Task A");
      expect(plan.batches[0]).toContain("Task B");
    });

    it("should respect dependencies and create multiple batches", () => {
      const analysis = {
        isParallelizable: true,
        independentSubtasks: ["Task A", "Task B", "Task C"],
        dependencies: {
          "Task B": ["Task A"],
        },
      };
      const plan = planExecution(analysis);
      expect(plan.batches).toHaveLength(2);
      expect(plan.batches[0]).toContain("Task A");
      expect(plan.batches[0]).toContain("Task C");
      expect(plan.batches[1]).toContain("Task B");
    });

    it("should handle multi-level dependencies", () => {
      const analysis = {
        isParallelizable: true,
        independentSubtasks: ["A", "B", "C"],
        dependencies: {
          B: ["A"],
          C: ["B"],
        },
      };
      const plan = planExecution(analysis);
      expect(plan.batches).toEqual([
        ["A"],
        ["B"],
        ["C"],
      ]);
    });

    it("should handle sequential fallback for circular dependencies", () => {
      const analysis = {
        isParallelizable: true,
        independentSubtasks: ["A", "B"],
        dependencies: {
          A: ["B"],
          B: ["A"],
        },
      };
      const plan = planExecution(analysis);
      expect(plan.batches).toHaveLength(2);
    });
  });
});
