import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { TeamStateAnnotation } from "../../graph/state.js";
import { createCommand, END } from "../../graph/utils/commands.js";
import { executeWorkersInParallel } from "../../graph/utils/parallelExecution.js";
import { maxConcurrentWorkers } from "../../config/index.js";

/**
 * Creates the supervisor and tools nodes.
 * 
 * @param llm - Language model to use.
 * @param tools - Tools available to the supervisor.
 * @param systemPrompt - System prompt for the supervisor.
 * @returns Object containing supervisorNode and toolsNode.
 */
export const createSupervisorNodes = (
  llm: BaseChatModel,
  tools: any[],
  systemPrompt: string,
) => {
  const supervisorNode = async (state: typeof TeamStateAnnotation.State) => {
    const toolCallCount = state.toolCallCount ?? 0;
    const maxToolCalls = state.maxToolCalls ?? 50;

    if (toolCallCount >= maxToolCalls) {
      return createCommand(END, {
        messages: [
          new AIMessage({
            content: `I've reached the maximum number of tool calls (${maxToolCalls}). I'll provide my best answer based on the information gathered so far.`,
          }),
        ],
      });
    }

    const response = await (llm as any).bindTools(tools).invoke([
      { role: "system", content: systemPrompt },
      ...state.messages,
    ]);

    if (response.tool_calls && response.tool_calls.length > 0) {
      return createCommand("tools", {
        messages: [response],
      });
    }

    return createCommand(END, {
      messages: [response],
    });
  };

  const toolsNode = async (state: typeof TeamStateAnnotation.State) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];

    const workers = toolCalls.map((tc) => ({
      name: tc.name,
      invoke: async () => {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) throw new Error(`Tool ${tc.name} not found`);
        return await (tool as any).invoke(tc.args);
      },
    }));

    const results = await executeWorkersInParallel(
      workers,
      maxConcurrentWorkers.parse(undefined),
    );

    const toolMessages = results.map((r, i) => {
      return new ToolMessage({
        content: r.error ? `Error: ${r.error.message}` : String(r.result),
        tool_call_id: toolCalls[i].id!,
      });
    });

    return {
      messages: toolMessages,
      toolCallCount: (state.toolCallCount ?? 0) + toolCalls.length,
    };
  };

  return { supervisorNode, toolsNode };
};
