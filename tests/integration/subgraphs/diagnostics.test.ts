import { describe, it, expect } from "@jest/globals";
import { diagnosticsSubgraph } from "../../../src/graph/subgraphs/diagnostics.js";

describe("Diagnostics Subgraph Integration", () => {
  it("should run full diagnostics workflow and generate a report", async () => {
    const initialState = {
      messages: [{ role: "user", content: "Run diagnostics" }]
    };

    const result = await diagnosticsSubgraph.invoke(initialState);
    
    expect(result.metrics).toBeDefined();
    expect(result.metrics).toMatchObject({
      cpu: "45%",
      memory: "2.4GB",
      disk: "12%"
    });

    expect(result.logs).toBeDefined();
    expect(result.logs).toContain("ERROR: Connection timeout at 10:45");
    expect(result.logs).toContain("WARN: High latency detected");

    expect(result.correlation).toBeDefined();
    expect(result.correlation).toContain("Correlated 3 metrics with 2 log entries.");

    expect(result.report).toBeDefined();
    expect(result.report).toContain("Diagnostic Report:");
    expect(result.report).toContain("Correlated 3 metrics with 2 log entries.");
  });
});
