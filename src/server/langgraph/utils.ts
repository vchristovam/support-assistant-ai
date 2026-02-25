export const getRunKey = (threadId: string, runId: string): string =>
  `${threadId}:${runId}`;

export const getStatelessRunKey = (runId: string): string =>
  getRunKey("__stateless__", runId);

export const toPositiveInt = (
  value: string | number | undefined,
  fallback: number,
): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return fallback;
};

export const matchesRecord = (
  filter: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
): boolean => {
  if (!filter) {
    return true;
  }
  for (const [key, value] of Object.entries(filter)) {
    if (candidate[key] !== value) {
      return false;
    }
  }
  return true;
};

export const getUserId = (request: unknown): string => {
  const user = (request as Record<string, unknown>).user as
    | { user_id: string }
    | undefined;
  return user?.user_id ?? "anonymous";
};

export const getIsoNow = (): string => new Date().toISOString();

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
};
