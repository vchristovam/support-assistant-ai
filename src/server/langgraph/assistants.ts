import { getIsoNow } from "./utils.js";

export const createAssistantRecord = (
  assistantId: string,
  graphId: string,
  metadata: Record<string, unknown> = {},
): Record<string, unknown> => {
  const now = getIsoNow();
  return {
    assistant_id: assistantId,
    graph_id: graphId,
    config: {},
    context: {},
    metadata,
    version: 1,
    created_at: now,
    updated_at: now,
    name: assistantId,
    description: null,
  };
};
