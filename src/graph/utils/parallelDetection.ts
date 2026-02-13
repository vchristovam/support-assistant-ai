export interface RequestAnalysis {
  isParallelizable: boolean;
  independentSubtasks: string[];
  dependencies: Record<string, string[]>;
}

export interface ExecutionPlan {
  batches: string[][];
}

/**
 * Analyzes a user request for parallelizable subtasks by detecting common separators.
 * @param request The raw user request string.
 * @returns The analysis results.
 */
export function analyzeRequest(request: string): RequestAnalysis {
  const trimmedRequest = request.trim();
  const lines = trimmedRequest.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  let subtasks: string[] = [];

  const listRegex = /^([-*]|\d+\.)\s+/;
  if (lines.length > 1 && lines.some((l) => listRegex.test(l))) {
    subtasks = lines
      .map((l) => l.replace(listRegex, "").trim())
      .filter((l) => l.length > 0);
  } else {
    subtasks = trimmedRequest
      .split(/\s+(?:and|also)\s+|[;]/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 3);
  }

  subtasks = [...new Set(subtasks)];

  return {
    isParallelizable: subtasks.length > 1,
    independentSubtasks: subtasks,
    dependencies: {},
  };
}

/**
 * Plans execution by grouping subtasks into parallelizable batches.
 * @param analysis The request analysis result.
 * @returns The execution plan.
 */
export function planExecution(analysis: RequestAnalysis): ExecutionPlan {
  if (!analysis.isParallelizable || analysis.independentSubtasks.length === 0) {
    return {
      batches: analysis.independentSubtasks.length > 0 ? [[analysis.independentSubtasks[0]]] : [],
    };
  }

  const hasDependencies = Object.keys(analysis.dependencies).length > 0;
  if (!hasDependencies) {
    return { batches: [analysis.independentSubtasks] };
  }

  const batches: string[][] = [];
  let remainingTasks = [...analysis.independentSubtasks];
  const completedTasks = new Set<string>();

  while (remainingTasks.length > 0) {
    const currentBatch = remainingTasks.filter((task) => {
      const deps = analysis.dependencies[task] || [];
      return deps.every((dep) => completedTasks.has(dep));
    });

    if (currentBatch.length === 0) {
      remainingTasks.forEach((task) => batches.push([task]));
      break;
    }

    batches.push(currentBatch);
    currentBatch.forEach((task) => completedTasks.add(task));
    remainingTasks = remainingTasks.filter((task) => !currentBatch.includes(task));
  }

  return { batches };
}
