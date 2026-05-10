import { describe, expect, test } from "bun:test";
import { parseLimit, parseOptionalCommaList, parseStrategy } from "../../../src/mcp/parseArgs";

describe("parseOptionalCommaList", () => {
  test("returns undefined for missing values", () => {
    expect(parseOptionalCommaList("engines", undefined)).toBeUndefined();
    expect(parseOptionalCommaList("engines", null)).toBeUndefined();
    expect(parseOptionalCommaList("engines", "")).toBeUndefined();
  });

  test("splits comma-separated strings and trims whitespace", () => {
    expect(parseOptionalCommaList("engines", "tavily,brave")).toEqual(["tavily", "brave"]);
    expect(parseOptionalCommaList("engines", "tavily, brave , linkup")).toEqual([
      "tavily",
      "brave",
      "linkup",
    ]);
  });

  test("accepts already-split arrays of strings", () => {
    expect(parseOptionalCommaList("engines", ["tavily", "brave"])).toEqual(["tavily", "brave"]);
  });

  test("filters empty entries after trimming", () => {
    expect(parseOptionalCommaList("engines", "tavily,,brave")).toEqual(["tavily", "brave"]);
    expect(parseOptionalCommaList("engines", "  ,  tavily  ,  ")).toEqual(["tavily"]);
  });

  test("returns undefined when all entries are empty", () => {
    expect(parseOptionalCommaList("engines", " ,, ")).toBeUndefined();
    expect(parseOptionalCommaList("engines", [])).toBeUndefined();
  });

  test("rejects non-string array members with Invalid params: prefix", () => {
    expect(() => parseOptionalCommaList("engines", ["tavily", 42])).toThrow(
      "Invalid params: 'engines' must contain only strings",
    );
  });

  test("rejects non-string non-array values with Invalid params: prefix", () => {
    expect(() => parseOptionalCommaList("engines", 42)).toThrow(
      "Invalid params: 'engines' must be a comma-separated string",
    );
    expect(() => parseOptionalCommaList("engines", { foo: "bar" })).toThrow(
      "Invalid params: 'engines' must be a comma-separated string",
    );
  });

  test("uses the provided paramName in error messages", () => {
    expect(() => parseOptionalCommaList("categories", 42)).toThrow(
      "Invalid params: 'categories' must be a comma-separated string",
    );
  });
});

describe("parseLimit", () => {
  test("returns undefined for missing values", () => {
    expect(parseLimit(undefined)).toBeUndefined();
    expect(parseLimit(null)).toBeUndefined();
    expect(parseLimit("")).toBeUndefined();
  });

  test("accepts positive integers as numbers", () => {
    expect(parseLimit(1)).toBe(1);
    expect(parseLimit(10)).toBe(10);
    expect(parseLimit(9999)).toBe(9999);
  });

  test("accepts positive-integer numeric strings", () => {
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit("100")).toBe(100);
    expect(parseLimit("  42  ")).toBe(42);
  });

  test("rejects zero", () => {
    expect(() => parseLimit(0)).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit("0")).toThrow("Invalid params: 'limit' must be a positive integer");
  });

  test("rejects negative numbers", () => {
    expect(() => parseLimit(-1)).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit("-5")).toThrow("Invalid params: 'limit' must be a positive integer");
  });

  test("rejects non-integer numbers", () => {
    expect(() => parseLimit(1.5)).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit("1.5")).toThrow("Invalid params: 'limit' must be a positive integer");
  });

  test("rejects non-numeric strings", () => {
    expect(() => parseLimit("abc")).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit("10abc")).toThrow("Invalid params: 'limit' must be a positive integer");
  });

  test("rejects unsupported types", () => {
    expect(() => parseLimit(true)).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit([5])).toThrow("Invalid params: 'limit' must be a positive integer");
    expect(() => parseLimit({})).toThrow("Invalid params: 'limit' must be a positive integer");
  });
});

describe("parseStrategy", () => {
  test("returns undefined for missing values", () => {
    expect(parseStrategy(undefined)).toBeUndefined();
    expect(parseStrategy(null)).toBeUndefined();
    expect(parseStrategy("")).toBeUndefined();
  });

  test("accepts the two valid values", () => {
    expect(parseStrategy("all")).toBe("all");
    expect(parseStrategy("first-success")).toBe("first-success");
  });

  test("rejects unknown strategy names", () => {
    expect(() => parseStrategy("ALL")).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
    expect(() => parseStrategy("first")).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
    expect(() => parseStrategy("any")).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
  });

  test("rejects non-string values", () => {
    expect(() => parseStrategy(1)).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
    expect(() => parseStrategy(true)).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
    expect(() => parseStrategy(["all"])).toThrow(
      "Invalid params: 'strategy' must be 'all' or 'first-success'",
    );
  });
});
