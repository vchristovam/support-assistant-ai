// Phase 1: Prompt Engineering Overhaul
// TypeScript types for the prompts module

export type PromptRole = 'system' | 'user' | 'assistant';

export interface Message {
  role: PromptRole;
  content: string;
  timestamp?: Date;
}

export interface Conversation {
  id: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

export type PromptTemplate = (context: Record<string, unknown>) => string;

export interface PromptConfig {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}
