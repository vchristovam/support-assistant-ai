import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

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
});
