import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { overrideReducer, uniqueAppendReducer } from "./reducers.js";

/**
 * AgentOutput interface for storing worker results.
 */
export interface AgentOutput {
  findings: string;
  completedAt: string;
  status: "success" | "error";
}

/**
 * TeamStateAnnotation defines the shared state used by all agents in the Supervisor Pattern.
 */
export const TeamStateAnnotation = Annotation.Root({
  /**
   * Messages track the primary execution state of the agent team.
   * It uses messagesStateReducer to ensure append-only behavior and proper merging.
   */
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),

  /**
   * The 'next' field tracks which agent should act next in the workflow.
   * This is typically set by the supervisor agent to route the conversation.
   */
  next: Annotation<string>,

  /**
   * Tracks the number of iterations executed to prevent infinite loops.
   */
  iterationCount: Annotation<number>,

  /**
   * Maximum number of iterations allowed before forcing termination.
   */
  maxIterations: Annotation<number>,

  /**
   * Tracks the number of tool calls made across all agents.
   */
  toolCallCount: Annotation<number>({
    reducer: overrideReducer,
    default: () => 0,
  }),

  /**
   * Maximum number of tool calls allowed before forcing termination.
   */
  maxToolCalls: Annotation<number>({
    reducer: overrideReducer,
    default: () => 50,
  }),

  /**
   * Domain context for the current request.
   * Supports override-based updates for complete context replacement.
   */
  requestContext: Annotation<Record<string, unknown>>({
    reducer: overrideReducer,
    default: () => ({}),
  }),

  /**
   * Store for worker agent outputs.
   * Maps agent names to their execution results.
   */
  agentOutputs: Annotation<Record<string, AgentOutput>>({
    reducer: overrideReducer,
    default: () => ({}),
  }),

  /**
   * Accumulated research findings from all agents.
   * Uses unique append to prevent duplicate notes.
   */
  researchNotes: Annotation<string[]>({
    reducer: uniqueAppendReducer,
    default: () => [],
  }),

  /**
   * ISO timestamp when the workflow started.
   */
  startedAt: Annotation<string>(),

  /**
   * ISO timestamp of the last activity.
   */
  lastActivityAt: Annotation<string>(),

  /**
   * Final research report output.
   */
  finalReport: Annotation<string>(),
});

export const SupervisorStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  supervisorMessages: Annotation<BaseMessage[]>({
    reducer: overrideReducer,
    default: () => [],
  }),
  iterationCount: Annotation<number>,
  pendingAgentCalls: Annotation<string[]>,
  completedAgentCalls: Annotation<string[]>,
});

export const createWorkerStateAnnotation = () =>
  Annotation.Root({
    messages: Annotation<BaseMessage[], BaseMessageLike[]>({
      reducer: messagesStateReducer,
      default: () => [],
    }),
    workerMessages: Annotation<BaseMessage[], BaseMessageLike[]>({
      reducer: messagesStateReducer,
      default: () => [],
    }),
    toolCallIterations: Annotation<number>,
    maxToolCalls: Annotation<number>,
    findings: Annotation<string>,
  });

export const WorkerOutputAnnotation = Annotation.Root({
  findings: Annotation<string>,
  rawNotes: Annotation<string[]>,
  completedAt: Annotation<string>,
});
