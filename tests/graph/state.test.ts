import { describe, it, expect } from "@jest/globals";
import { TeamStateAnnotation } from "../../src/graph/state.js";

describe("TeamStateAnnotation", () => {
  it("should be defined", () => {
    expect(TeamStateAnnotation).toBeDefined();
  });

  it("should have a messages channel", () => {
    expect(TeamStateAnnotation.spec.messages).toBeDefined();
  });

  it("should have a next channel", () => {
    expect(TeamStateAnnotation.spec.next).toBeDefined();
  });
});
