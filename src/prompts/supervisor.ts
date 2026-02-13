// XML-style supervisor prompt
// Thin wrapper that re-exports the factory function for clean API

import { createSupervisorPrompt } from "./utils.js";

/**
 * Factory function for creating supervisor system prompts.
 * Re-exported from utils for clean API usage.
 */
export { createSupervisorPrompt as createSupervisorSystemPrompt };
