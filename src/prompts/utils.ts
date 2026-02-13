// Phase 1: Prompt Engineering Overhaul
// Factory functions for creating prompts

import { getAllAgents, formatAgentForPrompt } from './agents.js';

/**
 * Context for prompt factory functions
 */
export interface PromptContext {
  date: string;
  activeAgents: string[];
  recentErrors?: string[];
  customContext?: Record<string, unknown>;
}

/**
 * Creates a user prompt from message
 */
export function createUserPrompt(userMessage: string): string {
  return userMessage;
}

/**
 * Formats conversation history
 */
export function formatConversation(history: string[]): string {
  return history.join('\n---\n');
}

/**
 * Creates a dynamic supervisor prompt with runtime context
 */
export function createSupervisorPrompt(context: PromptContext): string {
  const currentTime = context.date || new Date().toISOString();
  const activeAgentsList = context.activeAgents.join(', ');

  const allAgents = getAllAgents();
  const availableAgentsXml = allAgents
    .filter(agent => context.activeAgents.includes(agent.name))
    .map(formatAgentForPrompt)
    .join('\n\n');

  const errorsXml = context.recentErrors && context.recentErrors.length > 0
    ? `<RecentErrors>\n${context.recentErrors.map(err => `  <Error>${err}</Error>`).join('\n')}\n</RecentErrors>`
    : '';

  const customContextXml = context.customContext && Object.keys(context.customContext).length > 0
    ? `<CustomContext>\n${Object.entries(context.customContext)
        .map(([key, value]) => `  <${key}>${JSON.stringify(value)}</${key}>`)
        .join('\n')}\n</CustomContext>`
    : '';

  return `You are a support triage lead responsible for routing user requests to the appropriate specialized agent.

<Context>
<CurrentTime>${currentTime}</CurrentTime>
<ActiveAgents>${activeAgentsList}</ActiveAgents>
${errorsXml}
${customContextXml}
</Context>

<AvailableAgents>
${availableAgentsXml}
</AvailableAgents>

<Instructions>
<Instruction>Analyze the user's request and determine the best agent to handle it</Instruction>
<Instruction>Consider the capabilities of each available agent</Instruction>
<Instruction>Route to the most specific agent that can handle the request</Instruction>
<Instruction>Provide a brief explanation for your routing decision</Instruction>
</Instructions>

<Constraints>
<Constraint>Always verify agent availability before routing</Constraint>
<Constraint>Only route to agents listed in <AvailableAgents></Constraint>
<Constraint>Provide clear reasoning for routing decisions</Constraint>
<Constraint>If no agent matches, use human_interface agent</Constraint>
<Constraint>Respect agent capability boundaries</Constraint>
</Constraints>`;
}
