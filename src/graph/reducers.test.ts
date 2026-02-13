import { describe, it, expect } from "@jest/globals";
import {
  isOverrideUpdate,
  overrideReducer,
  uniqueAppendReducer,
  timestampReducer,
  OverrideUpdate,
  TimestampedValue,
} from "./reducers.js";

describe("isOverrideUpdate", () => {
  it("should return true for OverrideUpdate objects", () => {
    const update: OverrideUpdate<string> = { value: "test", override: true };
    expect(isOverrideUpdate(update)).toBe(true);
  });

  it("should return false for regular values", () => {
    expect(isOverrideUpdate("test")).toBe(false);
    expect(isOverrideUpdate(123)).toBe(false);
    expect(isOverrideUpdate([1, 2, 3])).toBe(false);
  });

  it("should return false for objects without override flag", () => {
    expect(isOverrideUpdate({ value: "test" } as unknown as string)).toBe(false);
    expect(isOverrideUpdate({ override: false, value: "test" } as unknown as string)).toBe(false);
  });

  it("should return false for null", () => {
    expect(isOverrideUpdate(null)).toBe(false);
  });
});

describe("overrideReducer", () => {
  it("should replace value when override flag is present", () => {
    const current = ["a", "b"];
    const update: OverrideUpdate<string[]> = {
      value: ["c", "d"],
      override: true,
    };
    const result = overrideReducer(current, update);
    expect(result).toEqual(["c", "d"]);
  });

  it("should replace primitive value when override flag is present", () => {
    const current = "old value";
    const update: OverrideUpdate<string> = {
      value: "new value",
      override: true,
    };
    const result = overrideReducer(current, update);
    expect(result).toBe("new value");
  });

  it("should append arrays when no override flag", () => {
    const current = ["a", "b"];
    const update = ["c", "d"];
    const result = overrideReducer(current, update);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("should replace non-array values when no override flag", () => {
    const current = "old value";
    const update = "new value";
    const result = overrideReducer(current, update);
    expect(result).toBe("new value");
  });

  it("should replace objects when no override flag", () => {
    type TestObj = { key1?: string; key2?: string };
    const current: TestObj = { key1: "value1" };
    const update: TestObj = { key2: "value2" };
    const result = overrideReducer(current, update);
    expect(result).toEqual({ key2: "value2" });
  });
});

describe("uniqueAppendReducer", () => {
  it("should append items without duplicates", () => {
    const current = ["a", "b", "c"];
    const update = ["d", "e"];
    const result = uniqueAppendReducer(current, update);
    expect(result).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("should deduplicate duplicate items", () => {
    const current = ["a", "b", "c"];
    const update = ["b", "c", "d"];
    const result = uniqueAppendReducer(current, update);
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("should handle empty arrays", () => {
    const current: string[] = [];
    const update = ["a", "b"];
    const result = uniqueAppendReducer(current, update);
    expect(result).toEqual(["a", "b"]);
  });

  it("should handle all duplicates", () => {
    const current = ["a", "b"];
    const update = ["a", "b"];
    const result = uniqueAppendReducer(current, update);
    expect(result).toEqual(["a", "b"]);
  });

  it("should work with numbers", () => {
    const current = [1, 2, 3];
    const update = [2, 3, 4, 5];
    const result = uniqueAppendReducer(current, update);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("timestampReducer", () => {
  it("should keep the latest value when update is newer", () => {
    const current: TimestampedValue<string> = {
      value: "old",
      timestamp: 1000,
    };
    const update: TimestampedValue<string> = {
      value: "new",
      timestamp: 2000,
    };
    const result = timestampReducer(current, update);
    expect(result).toEqual({ value: "new", timestamp: 2000 });
  });

  it("should keep current value when it is newer", () => {
    const current: TimestampedValue<string> = {
      value: "current",
      timestamp: 2000,
    };
    const update: TimestampedValue<string> = {
      value: "older",
      timestamp: 1000,
    };
    const result = timestampReducer(current, update);
    expect(result).toEqual({ value: "current", timestamp: 2000 });
  });

  it("should take update when timestamps are equal", () => {
    const current: TimestampedValue<number> = {
      value: 100,
      timestamp: 1000,
    };
    const update: TimestampedValue<number> = {
      value: 200,
      timestamp: 1000,
    };
    const result = timestampReducer(current, update);
    expect(result).toEqual({ value: 200, timestamp: 1000 });
  });

  it("should work with object values", () => {
    const current: TimestampedValue<{ id: number; data: string }> = {
      value: { id: 1, data: "old" },
      timestamp: 1000,
    };
    const update: TimestampedValue<{ id: number; data: string }> = {
      value: { id: 2, data: "new" },
      timestamp: 2000,
    };
    const result = timestampReducer(current, update);
    expect(result).toEqual({
      value: { id: 2, data: "new" },
      timestamp: 2000,
    });
  });
});
