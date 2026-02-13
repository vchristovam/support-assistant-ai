/**
 * Custom reducers for LangGraph state management.
 * These reducers provide advanced state update patterns beyond the default append behavior.
 */

/**
 * OverrideUpdate type for explicit value replacement.
 * When `override` is true, the entire value is replaced instead of merged/appended.
 */
export interface OverrideUpdate<T> {
  value: T;
  override: true;
}

/**
 * Type guard to check if an update is an OverrideUpdate.
 * @param update - The update value to check
 * @returns True if the update is an OverrideUpdate
 */
export const isOverrideUpdate = <T>(
  update: T | OverrideUpdate<T>,
): update is OverrideUpdate<T> => {
  return (
    typeof update === "object" &&
    update !== null &&
    "override" in update &&
    update.override === true
  );
};

/**
 * Reducer that supports explicit replacement via OverrideUpdate.
 * - If update has `override: true`, replaces the entire current value
 * - If both current and update are arrays, appends them
 * - Otherwise, replaces with the update value
 * @param current - The current state value
 * @param update - The update value (can be OverrideUpdate)
 * @returns The new state value
 */
export const overrideReducer = <T>(
  current: T,
  update: T | OverrideUpdate<T>,
): T => {
  if (isOverrideUpdate(update)) {
    return update.value;
  }
  // Handle arrays - append instead of replace
  if (Array.isArray(current) && Array.isArray(update)) {
    return [...current, ...update] as T;
  }
  // Default: replace
  return update;
};

/**
 * Reducer that appends items while ensuring uniqueness.
 * Uses Set for efficient deduplication.
 * Works with primitive values and objects (by reference for objects).
 * @param current - The current array of items
 * @param update - The new items to append
 * @returns Deduplicated array with all unique items
 */
export const uniqueAppendReducer = <T>(current: T[], update: T[]): T[] => {
  const combined = [...current, ...update];
  // Use Set for deduplication - works well for primitives
  // For objects, deduplication is by reference
  return Array.from(new Set(combined));
};

/**
 * Interface for timestamped values.
 */
export interface TimestampedValue<T> {
  value: T;
  timestamp: number;
}

/**
 * Reducer that always keeps the value with the latest timestamp.
 * Compares timestamps and returns the newer value.
 * @param current - The current timestamped value
 * @param update - The new timestamped value
 * @returns The value with the latest timestamp
 */
export const timestampReducer = <T>(
  current: TimestampedValue<T>,
  update: TimestampedValue<T>,
): TimestampedValue<T> => {
  // Always take the newer value based on timestamp
  return update.timestamp >= current.timestamp ? update : current;
};
