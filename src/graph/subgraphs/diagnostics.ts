import {
  Annotation,
  messagesStateReducer,
  START,
  END,
} from "@langchain/langgraph";
import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { createSubgraph } from "../utils/subgraph.js";

export const DiagnosticsState = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  metrics: Annotation<Record<string, any>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
  logs: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  correlation: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  report: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
});

const collectMetrics = async (
  _state: typeof DiagnosticsState.State,
): Promise<Partial<typeof DiagnosticsState.State>> => {
  return {
    metrics: { cpu: "45%", memory: "2.4GB", disk: "12%" },
  };
};

const analyzeLogs = async (
  _state: typeof DiagnosticsState.State,
): Promise<Partial<typeof DiagnosticsState.State>> => {
  return {
    logs: ["ERROR: Connection timeout at 10:45", "WARN: High latency detected"],
  };
};

const correlateEvents = async (
  state: typeof DiagnosticsState.State,
): Promise<Partial<typeof DiagnosticsState.State>> => {
  const { metrics, logs } = state;
  return {
    correlation: `Correlated ${Object.keys(metrics || {}).length} metrics with ${logs?.length || 0} log entries.`,
  };
};

const generateReport = async (
  state: typeof DiagnosticsState.State,
): Promise<Partial<typeof DiagnosticsState.State>> => {
  return {
    report: `Diagnostic Report: ${state.correlation}`,
  };
};

export const diagnosticsSubgraph = createSubgraph<
  typeof DiagnosticsState.State
>("diagnostics", DiagnosticsState, (builder) => {
  builder
    .addNode("collect_metrics", collectMetrics)
    .addNode("analyze_logs", analyzeLogs)
    .addNode("correlate_events", correlateEvents)
    .addNode("generate_report", generateReport)
    .addEdge(START, "collect_metrics")
    .addEdge("collect_metrics", "analyze_logs")
    .addEdge("analyze_logs", "correlate_events")
    .addEdge("correlate_events", "generate_report")
    .addEdge("generate_report", END);
});
