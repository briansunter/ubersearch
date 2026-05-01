import { describe, expect, test } from "bun:test";
import {
  mapSearchResult,
  PROVIDER_MAPPINGS,
} from "../../../../src/providers/helpers/resultMappers";

describe("result mappers", () => {
  test("should preserve numeric scores", () => {
    const item = mapSearchResult(
      {
        title: "Result",
        url: "https://example.com",
        content: "Snippet",
        score: 0.75,
      },
      "test-engine",
    );

    expect(item.score).toBe(0.75);
  });

  test("should parse numeric string scores", () => {
    const item = mapSearchResult(
      {
        title: "Result",
        url: "https://example.com",
        content: "Snippet",
        score: "0.75",
      },
      "test-engine",
    );

    expect(item.score).toBe(0.75);
  });

  test("should drop non-finite or non-numeric scores", () => {
    const nonNumeric = mapSearchResult(
      {
        title: "Result",
        url: "https://example.com",
        content: "Snippet",
        score: "high",
      },
      "test-engine",
    );
    const infinite = mapSearchResult(
      {
        title: "Result",
        url: "https://example.com",
        content: "Snippet",
        score: Number.POSITIVE_INFINITY,
      },
      "test-engine",
    );

    expect(nonNumeric.score).toBeUndefined();
    expect(infinite.score).toBeUndefined();
  });

  test("should trim mapped string fields", () => {
    const item = mapSearchResult(
      {
        title: "  Result  ",
        url: "  https://example.com  ",
        content: "  Snippet  ",
      },
      "test-engine",
    );

    expect(item.title).toBe("Result");
    expect(item.url).toBe("https://example.com");
    expect(item.snippet).toBe("Snippet");
  });

  test("should fall back to provider id for blank mapped source engine", () => {
    const item = mapSearchResult(
      {
        title: "Result",
        url: "https://example.com",
        engine: "   ",
      },
      "searchxng",
      PROVIDER_MAPPINGS.searchxng,
    );

    expect(item.sourceEngine).toBe("searchxng");
  });
});
