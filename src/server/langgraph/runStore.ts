import { v4 as uuidv4 } from "uuid";
import { isFinalRunStatus, validRunStatuses, type ValidRunStatus } from "./constants.js";
import type { RunBody, RunRecord, RunStatus, SearchRunsBody } from "./types.js";
import { getIsoNow, getRunKey } from "./utils.js";

const runs = new Map<string, RunRecord>();
const runsById = new Map<string, RunRecord>();
const runAbortControllers = new Map<string, AbortController>();

export const createRun = (
  threadId: string,
  assistantId: string,
  metadata: Record<string, unknown> = {},
  multitaskStrategy: RunBody["multitask_strategy"] | null = null,
): RunRecord => {
  const now = getIsoNow();
  return {
    run_id: `run-${uuidv4()}`,
    thread_id: threadId,
    assistant_id: assistantId,
    created_at: now,
    updated_at: now,
    status: "pending",
    metadata,
    kwargs: {},
    multitask_strategy: multitaskStrategy,
  };
};

export const setRunStatus = (
  run: RunRecord,
  status: RunStatus,
  error?: string,
): RunRecord => {
  run.status = status;
  run.updated_at = getIsoNow();
  if (error) {
    run.error = error;
  } else {
    delete run.error;
  }
  runs.set(getRunKey(run.thread_id, run.run_id), run);
  runsById.set(run.run_id, run);
  return run;
};

export const registerRun = (run: RunRecord): RunRecord => {
  runs.set(getRunKey(run.thread_id, run.run_id), run);
  runsById.set(run.run_id, run);
  return run;
};

export const getRunRecord = (
  threadId: string | undefined,
  runId: string,
): RunRecord | undefined => {
  if (threadId) {
    return runs.get(getRunKey(threadId, runId));
  }
  return runsById.get(runId);
};

export const getRunByThread = (
  threadId: string,
  runId: string,
): RunRecord | undefined => {
  return runs.get(getRunKey(threadId, runId));
};

export const getRunByKey = (runKey: string): RunRecord | undefined => {
  return runs.get(runKey);
};

export const getOrCreateRun = (
  threadId: string,
  runId: string,
  assistantId = "agent",
): RunRecord => {
  const runKey = getRunKey(threadId, runId);
  const existing = runs.get(runKey);
  if (existing) {
    return existing;
  }

  const run = createRun(threadId, assistantId, {});
  run.run_id = runId;
  runs.set(runKey, run);
  runsById.set(runId, run);
  return run;
};

export const listRunsByThread = (
  threadId: string,
  options: SearchRunsBody = {},
): RunRecord[] => {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const status =
    typeof options.status === "string" &&
    validRunStatuses.includes(options.status as ValidRunStatus)
      ? (options.status as ValidRunStatus)
      : undefined;

  const filtered = Array.from(runs.values())
    .filter((run) => run.thread_id === threadId)
    .filter((run) => (status ? run.status === status : true))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return filtered.slice(offset, offset + limit);
};

export const waitForRunCompletion = async (
  run: RunRecord,
  timeoutMs = 60_000,
): Promise<RunRecord> => {
  if (isFinalRunStatus(run.status)) {
    return run;
  }

  const runKey = getRunKey(run.thread_id, run.run_id);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const latest = runs.get(runKey) ?? run;
    if (isFinalRunStatus(latest.status)) {
      return latest;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  return setRunStatus(run, "timeout", "Run join timeout");
};

export const setRunAbortController = (
  runKey: string,
  controller: AbortController,
): void => {
  runAbortControllers.set(runKey, controller);
};

export const getRunAbortController = (
  runKey: string,
): AbortController | undefined => {
  return runAbortControllers.get(runKey);
};

export const deleteRunAbortController = (runKey: string): void => {
  runAbortControllers.delete(runKey);
};

export const removeRun = (runKey: string, runId: string): void => {
  runAbortControllers.delete(runKey);
  runs.delete(runKey);
  runsById.delete(runId);
};
