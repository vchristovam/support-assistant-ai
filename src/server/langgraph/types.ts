import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { IThreadRepository } from "../../repositories/index.js";

export type StreamMode =
  | "values"
  | "updates"
  | "messages"
  | "messages-tuple"
  | "events"
  | "tasks"
  | "checkpoints"
  | "custom";

export type RunStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "interrupted"
  | "timeout";

export interface RunBody {
  assistant_id?: string;
  input?: Record<string, unknown> | null;
  command?: Record<string, unknown>;
  stream_mode?: StreamMode | StreamMode[];
  stream_subgraphs?: boolean;
  stream_resumable?: boolean;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
  multitask_strategy?: "reject" | "interrupt" | "rollback" | "enqueue";
  on_disconnect?: "cancel" | "continue";
  checkpoint?: Record<string, unknown>;
  checkpoint_id?: string;
  durability?: "sync" | "async" | "exit";
  signal?: AbortSignal;
}

export interface RunRecord {
  run_id: string;
  thread_id: string;
  assistant_id: string;
  created_at: string;
  updated_at: string;
  status: RunStatus;
  metadata: Record<string, unknown>;
  kwargs: Record<string, unknown>;
  multitask_strategy?: RunBody["multitask_strategy"] | null;
  error?: string;
}

export interface CreateThreadBody {
  thread_id?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchThreadsBody {
  metadata?: Record<string, unknown>;
  ids?: string[];
  limit?: number;
  offset?: number;
  status?: string;
  values?: Record<string, unknown>;
}

export interface CountThreadsBody {
  metadata?: Record<string, unknown>;
  values?: Record<string, unknown>;
  status?: string;
}

export interface SearchRunsQuery {
  limit?: string | number;
  offset?: string | number;
  status?: string;
}

export interface SearchRunsBody {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface CancelRunQuery {
  wait?: string | number;
  action?: "interrupt" | "rollback";
}

export interface ThreadPatchBody {
  metadata?: Record<string, unknown>;
  ttl?: unknown;
}

export interface ThreadStateCheckpointBody {
  checkpoint?: Record<string, unknown>;
  subgraphs?: boolean;
}

export interface ThreadStateUpdateBody {
  values?: Record<string, unknown>;
  checkpoint_id?: string;
  checkpoint?: Record<string, unknown>;
  as_node?: string;
}

export interface ThreadStatePatchBody {
  metadata?: Record<string, unknown>;
}

export interface ThreadHistoryBody {
  limit?: number;
  before?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  checkpoint?: Record<string, unknown>;
}

export interface AssistantSearchBody {
  graph_id?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface InterruptBody {
  command?: Record<string, unknown>;
  resume?: unknown;
  decision?: "approve" | "accept" | "reject" | "edit";
  edited_action?: unknown;
  value?: unknown;
}

export interface ThreadRunServices {
  threadRepository: IThreadRepository;
  checkpointer: BaseCheckpointSaver;
  llm?: BaseChatModel;
}
