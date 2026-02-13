/**
 * Parallel execution utility for Phase 3.1
 * Provides concurrent worker execution with error handling
 */

export interface Worker<T> {
  name: string;
  invoke: () => Promise<T>;
}

export interface WorkerResult<T> {
  name: string;
  result: T | null;
  error?: Error;
}

export interface AggregatedResults<T> {
  successful: WorkerResult<T>[];
  failed: WorkerResult<T>[];
  total: number;
  successCount: number;
  failureCount: number;
}

/**
 * Execute workers in parallel with concurrency control
 * @param workers - Array of workers to execute
 * @param maxConcurrency - Maximum number of workers to run simultaneously (default: 5)
 * @returns Array of worker results with success/error info
 */
export const executeWorkersInParallel = async <T>(
  workers: Worker<T>[],
  maxConcurrency = 5,
): Promise<WorkerResult<T>[]> => {
  const results: WorkerResult<T>[] = [];

  for (let i = 0; i < workers.length; i += maxConcurrency) {
    const batch = workers.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (worker) => {
        try {
          const result = await worker.invoke();
          return { name: worker.name, result };
        } catch (error) {
          return { name: worker.name, result: null, error: error as Error };
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
};

/**
 * Aggregate worker results into a formatted summary
 * @param results - Array of worker results from executeWorkersInParallel
 * @returns Aggregated results with success/failure breakdown
 */
export const aggregateResults = <T>(
  results: WorkerResult<T>[],
): AggregatedResults<T> => {
  const successful = results.filter((r) => r.error === undefined);
  const failed = results.filter((r) => r.error !== undefined);

  return {
    successful,
    failed,
    total: results.length,
    successCount: successful.length,
    failureCount: failed.length,
  };
};

/**
 * Format aggregated results for display/logging
 * @param aggregated - Aggregated results from aggregateResults
 * @returns Formatted string representation
 */
export const formatResults = <T>(aggregated: AggregatedResults<T>): string => {
  const lines = [
    `Parallel Execution Summary:`,
    `  Total workers: ${aggregated.total}`,
    `  Successful: ${aggregated.successCount}`,
    `  Failed: ${aggregated.failureCount}`,
  ];

  if (aggregated.successful.length > 0) {
    lines.push(`\n  Successful workers:`);
    aggregated.successful.forEach((r) => {
      lines.push(`    - ${r.name}`);
    });
  }

  if (aggregated.failed.length > 0) {
    lines.push(`\n  Failed workers:`);
    aggregated.failed.forEach((r) => {
      lines.push(`    - ${r.name}: ${r.error?.message || "Unknown error"}`);
    });
  }

  return lines.join("\n");
};
