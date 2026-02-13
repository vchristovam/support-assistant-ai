export interface BenchmarkCase {
  id: string;
  category: string;
  query: string;
  expectedOutput?: string;
  keyFacts?: string[];
}

export const BENCHMARK_SUITE: BenchmarkCase[] = [
  {
    id: "data-01",
    category: "databricks",
    query: "Show me the top 5 customers by revenue in the last quarter",
    keyFacts: ["customer_id", "revenue", "top 5", "last quarter"],
  },
  {
    id: "monitor-01",
    category: "dynatrace",
    query: "Are there any active problems in the production environment?",
    keyFacts: ["active problems", "production environment", "status"],
  },
  {
    id: "kb-01",
    category: "knowledge",
    query: "What is the procedure for handling a P1 incident?",
    keyFacts: ["P1 incident", "procedure", "escalation"],
  },
  {
    id: "ops-01",
    category: "operations",
    query: "Restart the web service in the staging environment",
    keyFacts: ["restart", "web service", "staging"],
  },
  {
    id: "complex-01",
    category: "multi-step",
    query:
      "Identify the service with the highest error rate and find its recent deployment history",
    keyFacts: [
      "highest error rate",
      "deployment history",
      "service correlation",
    ],
  },
];
