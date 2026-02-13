/**
 * Tests for parallel execution utility
 */

import { describe, it, expect } from "@jest/globals";
import {
  executeWorkersInParallel,
  aggregateResults,
  formatResults,
  type Worker,
  type WorkerResult,
} from "./parallelExecution.js";

describe("executeWorkersInParallel", () => {
  it("should execute a single worker successfully", async () => {
    const workers: Worker<string>[] = [
      {
        name: "test-worker",
        invoke: async () => "result",
      },
    ];

    const results = await executeWorkersInParallel(workers);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      name: "test-worker",
      result: "result",
    });
  });

  it("should execute multiple workers in parallel", async () => {
    const workers: Worker<number>[] = [
      { name: "worker-1", invoke: async () => 1 },
      { name: "worker-2", invoke: async () => 2 },
      { name: "worker-3", invoke: async () => 3 },
    ];

    const results = await executeWorkersInParallel(workers);

    expect(results).toHaveLength(3);
    expect(results.map((r: WorkerResult<number>) => r.result)).toContain(1);
    expect(results.map((r: WorkerResult<number>) => r.result)).toContain(2);
    expect(results.map((r: WorkerResult<number>) => r.result)).toContain(3);
  });

  it("should respect maxConcurrency limit", async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const workers: Worker<void>[] = Array.from({ length: 10 }, (_, i) => ({
      name: `worker-${i}`,
      invoke: async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        currentConcurrent--;
      },
    }));

    await executeWorkersInParallel(workers, 3);

    expect(maxConcurrent).toBe(3);
  });

  it("should handle errors gracefully without stopping other workers", async () => {
    const workers: Worker<string>[] = [
      { name: "worker-1", invoke: async () => "success-1" },
      {
        name: "worker-2",
        invoke: async () => {
          throw new Error("worker-2-error");
        },
      },
      { name: "worker-3", invoke: async () => "success-2" },
    ];

    const results = await executeWorkersInParallel(workers);

    expect(results).toHaveLength(3);

    const worker1Result = results.find(
      (r: WorkerResult<string>) => r.name === "worker-1",
    );
    const worker2Result = results.find(
      (r: WorkerResult<string>) => r.name === "worker-2",
    );
    const worker3Result = results.find(
      (r: WorkerResult<string>) => r.name === "worker-3",
    );

    expect(worker1Result?.result).toBe("success-1");
    expect(worker1Result?.error).toBeUndefined();

    expect(worker2Result?.result).toBeNull();
    expect(worker2Result?.error).toBeInstanceOf(Error);
    expect(worker2Result?.error?.message).toBe("worker-2-error");

    expect(worker3Result?.result).toBe("success-2");
    expect(worker3Result?.error).toBeUndefined();
  });

  it("should handle empty worker array", async () => {
    const results = await executeWorkersInParallel([]);
    expect(results).toHaveLength(0);
  });

  it("should process batches correctly when workers exceed maxConcurrency", async () => {
    const executionOrder: string[] = [];

    const workers: Worker<string>[] = Array.from({ length: 7 }, (_, i) => ({
      name: `worker-${i}`,
      invoke: async () => {
        executionOrder.push(`worker-${i}`);
        return `result-${i}`;
      },
    }));

    await executeWorkersInParallel(workers, 3);

    expect(executionOrder).toHaveLength(7);
  });
});

describe("aggregateResults", () => {
  it("should aggregate results correctly", () => {
    const results = [
      { name: "worker-1", result: "data-1" },
      { name: "worker-2", result: null, error: new Error("error-2") },
      { name: "worker-3", result: "data-3" },
      { name: "worker-4", result: null, error: new Error("error-4") },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.total).toBe(4);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.successful).toHaveLength(2);
    expect(aggregated.failed).toHaveLength(2);
  });

  it("should handle all successful results", () => {
    const results = [
      { name: "worker-1", result: "data-1" },
      { name: "worker-2", result: "data-2" },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.total).toBe(2);
    expect(aggregated.successCount).toBe(2);
    expect(aggregated.failureCount).toBe(0);
    expect(aggregated.failed).toHaveLength(0);
  });

  it("should handle all failed results", () => {
    const results = [
      { name: "worker-1", result: null, error: new Error("error-1") },
      { name: "worker-2", result: null, error: new Error("error-2") },
    ];

    const aggregated = aggregateResults(results);

    expect(aggregated.total).toBe(2);
    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(2);
    expect(aggregated.successful).toHaveLength(0);
  });

  it("should handle empty results array", () => {
    const aggregated = aggregateResults([]);

    expect(aggregated.total).toBe(0);
    expect(aggregated.successCount).toBe(0);
    expect(aggregated.failureCount).toBe(0);
  });
});

describe("formatResults", () => {
  it("should format results with both successes and failures", () => {
    const aggregated = {
      successful: [{ name: "worker-1", result: "data" }],
      failed: [
        { name: "worker-2", result: null, error: new Error("error-msg") },
      ],
      total: 2,
      successCount: 1,
      failureCount: 1,
    };

    const formatted = formatResults(aggregated);

    expect(formatted).toContain("Total workers: 2");
    expect(formatted).toContain("Successful: 1");
    expect(formatted).toContain("Failed: 1");
    expect(formatted).toContain("worker-1");
    expect(formatted).toContain("worker-2");
    expect(formatted).toContain("error-msg");
  });

  it("should format results with only successes", () => {
    const aggregated = {
      successful: [{ name: "worker-1", result: "data" }],
      failed: [],
      total: 1,
      successCount: 1,
      failureCount: 0,
    };

    const formatted = formatResults(aggregated);

    expect(formatted).toContain("Successful: 1");
    expect(formatted).toContain("Failed: 0");
    expect(formatted).not.toContain("Failed workers:");
  });
});
