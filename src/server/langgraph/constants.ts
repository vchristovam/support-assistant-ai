import type { RunStatus } from "./types.js";

export const validThreadStatuses = [
  "idle",
  "busy",
  "interrupted",
  "error",
] as const;
export type ValidThreadStatus = (typeof validThreadStatuses)[number];

export const validRunStatuses = [
  "pending",
  "running",
  "success",
  "error",
  "interrupted",
  "timeout",
] as const;
export type ValidRunStatus = (typeof validRunStatuses)[number];

export const STATELESS_THREAD_ID = "__stateless__";

export const isFinalRunStatus = (status: RunStatus): boolean =>
  status === "success" ||
  status === "error" ||
  status === "interrupted" ||
  status === "timeout";
