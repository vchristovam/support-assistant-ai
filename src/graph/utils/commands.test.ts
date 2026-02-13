import { Command } from "@langchain/langgraph";
import { END, START, createCommand } from "./commands.js";

describe("commands", () => {
  describe("constants", () => {
    it("should define END as __end__", () => {
      expect(END).toBe("__end__");
    });

    it("should define START as __start__", () => {
      expect(START).toBe("__start__");
    });
  });

  describe("createCommand", () => {
    it("should create Command with correct goto", () => {
      const command = createCommand("supervisor");

      expect(command).toBeInstanceOf(Command);
      expect(command.goto).toEqual(["supervisor"]);
    });

    it("should include update when provided", () => {
      const update = { status: "completed", result: "success" };
      const command = createCommand("databricks_agent", update);

      expect(command).toBeInstanceOf(Command);
      expect(command.goto).toEqual(["databricks_agent"]);
      expect(command.update).toEqual(update);
    });

    it("should work with END constant", () => {
      const command = createCommand(END);

      expect(command).toBeInstanceOf(Command);
      expect(command.goto).toEqual(["__end__"]);
    });

    it("should work with START constant", () => {
      const command = createCommand(START);

      expect(command).toBeInstanceOf(Command);
      expect(command.goto).toEqual(["__start__"]);
    });

    it("should handle empty update object", () => {
      const command = createCommand("knowledge_agent", {});

      expect(command).toBeInstanceOf(Command);
      expect(command.goto).toEqual(["knowledge_agent"]);
      expect(command.update).toEqual({});
    });
  });
});
