import { AIMessage } from "@langchain/core/messages";
import { createCommand, END } from "../../graph/utils/commands.js";
import {
  executeWorkersInParallel,
  aggregateResults,
  formatResults,
} from "../../graph/utils/parallelExecution.js";
import { analyzeRequest } from "../../graph/utils/parallelDetection.js";
import { maxConcurrentWorkers } from "../../config/index.js";

const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Wraps an agent to track iterations and enforce a maximum limit.
 * If the limit is reached, returns a graceful termination message.
 */
export const createIterationTrackingWrapper = (
  agent: any,
  maxIterations: number = DEFAULT_MAX_ITERATIONS,
) => {
  let iterationCount = 0;
  const graph = agent.graph || agent;
  const originalInvoke = graph.invoke.bind(graph);

  graph.invoke = async (input: any, options: any) => {
    const messages = input.messages || [];
    const lastMessage = messages[messages.length - 1];

    if (
      iterationCount === 0 &&
      lastMessage &&
      (typeof lastMessage.getType === "function"
        ? lastMessage.getType() === "human"
        : lastMessage._getType === "human" || lastMessage.role === "user")
    ) {
      const content = lastMessage.content;
      if (typeof content === "string") {
        const analysis = analyzeRequest(content);
        if (analysis.isParallelizable) {
          const workers = analysis.independentSubtasks.map((subtask, i) => ({
            name: `Subtask ${i + 1}`,
            invoke: async () => {
              const result = await originalInvoke(
                { ...input, messages: [{ role: "user", content: subtask }] },
                options,
              );
              const msgs = (result as any).messages;
              return msgs[msgs.length - 1].content;
            },
          }));

          const results = await executeWorkersInParallel(
            workers,
            maxConcurrentWorkers.parse(undefined),
          );

          const aggregated = aggregateResults(results);
          const combinedResponse = formatResults(aggregated);

          return {
            messages: [
              new AIMessage({
                content: `I've processed your request in parallel subtasks:\n\n${combinedResponse}`,
              }),
            ],
          } as any;
        }
      }
    }

    const toolCallCount = input.toolCallCount ?? 0;
    const maxToolCalls = input.maxToolCalls ?? 50;

    if (iterationCount >= maxIterations || toolCallCount >= maxToolCalls) {
      const reason =
        iterationCount >= maxIterations ? "iterations" : "tool calls";
      const limit =
        iterationCount >= maxIterations ? maxIterations : maxToolCalls;

      return createCommand(END, {
        messages: [
          new AIMessage({
            content: `I've reached the maximum number of ${reason} (${limit}). Let me provide my best answer based on what I've gathered so far.`,
          }),
        ],
      });
    }

    iterationCount++;

    return originalInvoke(input, options);
  };

  return agent;
};
