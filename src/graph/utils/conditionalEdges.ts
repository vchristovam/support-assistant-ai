import { TeamStateAnnotation } from "../state.js";

/**
 * Type representing the state derived from TeamStateAnnotation
 */
export type TeamState = typeof TeamStateAnnotation.State;

/**
 * Type for a condition function that evaluates state and returns a branch key
 */
export type ConditionFunction<T extends string> = (state: TeamState) => T;

/**
 * Type for targets mapping branch keys to node names
 */
export type ConditionTargets<T extends string> = Record<T, string>;

/**
 * Creates a conditional edge function for LangGraph.
 *
 * @param condition - Function that evaluates state and returns a branch key
 * @param targets - Mapping of branch keys to target node names
 * @returns Conditional edge function for use with addConditionalEdges
 *
 * @example
 * ```typescript
 * const edge = createConditionalEdges(
 *   (state) => state.iterationCount >= 5 ? 'end' : 'continue',
 *   { end: '__end__', continue: 'process' }
 * );
 * builder.addConditionalEdges('node', edge);
 * ```
 */
export const createConditionalEdges = <T extends string>(
  condition: ConditionFunction<T>,
  targets: ConditionTargets<T>,
): ((state: TeamState) => string) => {
  return (state: TeamState): string => {
    const result = condition(state);
    return targets[result];
  };
};

/**
 * Common condition helper functions for creating conditional edges.
 * These factory functions create condition functions that can be used
 * with createConditionalEdges or directly in conditional edges.
 */
export const Conditions = {
  /**
   * Checks if the iteration count has reached or exceeded the maximum.
   *
   * @param max - Maximum number of iterations allowed
   * @returns Condition function that returns 'end' if limit reached, 'continue' otherwise
   *
   * @example
   * ```typescript
   * const condition = Conditions.iterationLimit(10);
   * const edge = createConditionalEdges(condition, {
   *   end: '__end__',
   *   continue: 'process'
   * });
   * ```
   */
  iterationLimit:
    (max: number) =>
    (state: TeamState): "end" | "continue" =>
      state.iterationCount >= max ? "end" : "continue",

  /**
   * Checks if a specific field in the state has content (truthy value).
   *
   * @param field - Key of the field to check in TeamState
   * @returns Condition function that returns 'has_content' or 'empty'
   *
   * @example
   * ```typescript
   * const condition = Conditions.hasContent('finalReport');
   * const edge = createConditionalEdges(condition, {
   *   has_content: 'formatOutput',
   *   empty: 'generateReport'
   * });
   * ```
   */
  hasContent:
    (field: keyof TeamState) =>
    (state: TeamState): "has_content" | "empty" => {
      const value = state[field];
      if (Array.isArray(value)) {
        return value.length > 0 ? "has_content" : "empty";
      }
      return value ? "has_content" : "empty";
    },

  /**
   * Checks if a field value equals 'complete'.
   * Useful for tracking task completion status.
   *
   * @param field - Key of the field to check in TeamState
   * @returns Condition function that returns 'complete' or 'incomplete'
   *
   * @example
   * ```typescript
   * const condition = Conditions.isComplete('status');
   * const edge = createConditionalEdges(condition, {
   *   complete: '__end__',
   *   incomplete: 'continueProcessing'
   * });
   * ```
   */
  isComplete:
    (field: keyof TeamState) =>
    (state: TeamState): "complete" | "incomplete" =>
      state[field] === "complete" ? "complete" : "incomplete",
};

/**
 * Type representing the possible return values from Conditions.iterationLimit
 */
export type IterationLimitResult = "end" | "continue";

/**
 * Type representing the possible return values from Conditions.hasContent
 */
export type HasContentResult = "has_content" | "empty";

/**
 * Type representing the possible return values from Conditions.isComplete
 */
export type IsCompleteResult = "complete" | "incomplete";
