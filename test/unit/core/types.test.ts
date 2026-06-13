/**
 * Comprehensive tests for core types and utilities
 */

import { describe, expect, test } from "bun:test";
import type {
  EngineId,
  SearchFailureReason,
  SearchQuery,
  SearchResponse,
  SearchResultItem,
} from "../../../src/core/types";
import { SearchError } from "../../../src/core/types";

describe("Core Types", () => {
  describe("EngineId", () => {
    test("should be a string type", () => {
      const engineId: EngineId = "tavily";
      expect(typeof engineId).toBe("string");
      expect(engineId).toBe("tavily");
    });

    test("should accept any string value", () => {
      const engine1: EngineId = "provider-1";
      const engine2: EngineId = "custom-engine";
      const engine3: EngineId = "test123";

      expect(engine1).toBe("provider-1");
      expect(engine2).toBe("custom-engine");
      expect(engine3).toBe("test123");
    });
  });

  describe("SearchQuery", () => {
    test("should create valid query with required fields", () => {
      const query: SearchQuery = {
        query: "test search",
      };

      expect(query.query).toBe("test search");
      expect(query.limit).toBeUndefined();
      expect(query.includeRaw).toBeUndefined();
    });

    test("should create query with optional limit", () => {
      const query: SearchQuery = {
        query: "test search",
        limit: 10,
      };

      expect(query.query).toBe("test search");
      expect(query.limit).toBe(10);
      expect(query.includeRaw).toBeUndefined();
    });

    test("should create query with includeRaw option", () => {
      const query: SearchQuery = {
        query: "test search",
        includeRaw: true,
      };

      expect(query.query).toBe("test search");
      expect(query.includeRaw).toBe(true);
      expect(query.limit).toBeUndefined();
    });

    test("should create query with all options", () => {
      const query: SearchQuery = {
        query: "test search",
        limit: 5,
        includeRaw: false,
      };

      expect(query.query).toBe("test search");
      expect(query.limit).toBe(5);
      expect(query.includeRaw).toBe(false);
    });

    test("should handle empty query string", () => {
      const query: SearchQuery = {
        query: "",
      };

      expect(query.query).toBe("");
    });

    test("should handle very long query string", () => {
      const longQuery = "a".repeat(1000);
      const query: SearchQuery = {
        query: longQuery,
      };

      expect(query.query).toBe(longQuery);
      expect(query.query.length).toBe(1000);
    });
  });

  describe("SearchResultItem", () => {
    test("should create minimal result item", () => {
      const item: SearchResultItem = {
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test snippet",
        sourceEngine: "tavily",
      };

      expect(item.title).toBe("Test Result");
      expect(item.url).toBe("https://example.com");
      expect(item.snippet).toBe("Test snippet");
      expect(item.sourceEngine).toBe("tavily");
      expect(item.score).toBeUndefined();
    });

    test("should create result item with score", () => {
      const item: SearchResultItem = {
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test snippet",
        sourceEngine: "brave",
        score: 0.95,
      };

      expect(item.score).toBe(0.95);
    });

    test("should handle various score values", () => {
      const scores = [0, 0.5, 0.99, 1.0];

      scores.forEach((score) => {
        const item: SearchResultItem = {
          title: "Test",
          url: "https://test.com",
          snippet: "Test",
          sourceEngine: "test",
          score,
        };

        expect(item.score).toBe(score);
      });
    });

    test("should handle special characters in URLs", () => {
      const item: SearchResultItem = {
        title: "Test",
        url: "https://example.com/search?q=hello%20world&lang=en",
        snippet: "Test snippet",
        sourceEngine: "test",
      };

      expect(item.url).toContain("hello%20world");
    });

    test("should handle empty title and snippet", () => {
      const item: SearchResultItem = {
        title: "",
        url: "https://example.com",
        snippet: "",
        sourceEngine: "test",
      };

      expect(item.title).toBe("");
      expect(item.snippet).toBe("");
    });
  });

  describe("SearchResponse", () => {
    test("should create minimal response", () => {
      const response: SearchResponse = {
        engineId: "tavily",
        items: [],
        tookMs: 100,
      };

      expect(response.engineId).toBe("tavily");
      expect(response.items).toHaveLength(0);
      expect(response.tookMs).toBe(100);
      expect(response.raw).toBeUndefined();
    });

    test("should create response with items", () => {
      const items: SearchResultItem[] = [
        {
          title: "Result 1",
          url: "https://example1.com",
          snippet: "Snippet 1",
          sourceEngine: "tavily",
        },
        {
          title: "Result 2",
          url: "https://example2.com",
          snippet: "Snippet 2",
          sourceEngine: "tavily",
          score: 0.8,
        },
      ];

      const response: SearchResponse = {
        engineId: "tavily",
        items,
        tookMs: 250,
      };

      expect(response.items).toHaveLength(2);
      expect(response.items[0]!.title).toBe("Result 1");
      expect(response.items[1]!.score).toBe(0.8);
    });

    test("should create response with raw data", () => {
      const rawData = {
        status: "success",
        total: 10,
        results: [],
      };

      const response: SearchResponse = {
        engineId: "brave",
        items: [],
        tookMs: 150,
        raw: rawData,
      };

      expect(response.raw).toBe(rawData);
      expect((response.raw as typeof rawData)?.status).toBe("success");
    });

    test("should handle zero timing", () => {
      const response: SearchResponse = {
        engineId: "test",
        items: [],
        tookMs: 0,
      };

      expect(response.tookMs).toBe(0);
    });

    test("should handle negative timing (edge case)", () => {
      const response: SearchResponse = {
        engineId: "test",
        items: [],
        tookMs: -1,
      };

      expect(response.tookMs).toBe(-1);
    });
  });

  describe("SearchFailureReason", () => {
    test("should include all defined failure reasons", () => {
      const reasons: SearchFailureReason[] = [
        "network_error",
        "api_error",
        "no_results",
        "low_credit",
        "config_error",
        "no_provider",
        "provider_unavailable",
        "unknown",
      ];

      reasons.forEach((reason) => {
        expect(reason).toBeTruthy();
      });
    });

    test("should be assignable to string", () => {
      const reason: SearchFailureReason = "api_error";
      const reasonString: string = reason;

      expect(reasonString).toBe("api_error");
    });
  });

  describe("SearchError", () => {
    test("should create error with minimal parameters", () => {
      const error = new SearchError("tavily", "api_error", "Test error");

      expect(error.engineId).toBe("tavily");
      expect(error.reason).toBe("api_error");
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("SearchError");
      expect(error.statusCode).toBeUndefined();
    });

    test("should create error with status code", () => {
      const error = new SearchError("brave", "network_error", "Connection failed", 500);

      expect(error.engineId).toBe("brave");
      expect(error.reason).toBe("network_error");
      expect(error.message).toBe("Connection failed");
      expect(error.statusCode).toBe(500);
    });

    test("should handle all failure reason types", () => {
      const reasons: SearchFailureReason[] = [
        "network_error",
        "api_error",
        "no_results",
        "low_credit",
        "config_error",
        "no_provider",
        "provider_unavailable",
        "unknown",
      ];

      reasons.forEach((reason) => {
        const error = new SearchError("test", reason, `Error for ${reason}`);
        expect(error.reason).toBe(reason);
      });
    });

    test("should preserve stack trace", () => {
      const error = new SearchError("test", "api_error", "Test error");
      expect(error.stack).toBeTruthy();
      expect(error.stack).toContain("SearchError");
    });

    test("should handle empty message", () => {
      const error = new SearchError("test", "api_error", "");
      expect(error.message).toBe("");
    });

    test("should handle very long message", () => {
      const longMessage = "a".repeat(10000);
      const error = new SearchError("test", "api_error", longMessage);
      expect(error.message).toBe(longMessage);
      expect(error.message.length).toBe(10000);
    });

    test("should handle special characters in message", () => {
      const specialMessage = "Error with émojis 🚀 and spëcial chars";
      const error = new SearchError("test", "api_error", specialMessage);
      expect(error.message).toBe(specialMessage);
    });

    test("should handle various status codes", () => {
      const statusCodes = [0, 200, 404, 500, 502, 503, 999];

      statusCodes.forEach((code) => {
        const error = new SearchError("test", "api_error", "Test", code);
        expect(error.statusCode).toBe(code);
      });
    });

    test("should be throwable and catchable", () => {
      try {
        throw new SearchError("test", "api_error", "Test error");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        expect(error).toBeInstanceOf(Error);
        expect((error as SearchError).engineId).toBe("test");
        expect((error as SearchError).reason).toBe("api_error");
      }
    });

    test("should allow instanceof checks", () => {
      const error = new SearchError("test", "api_error", "Test error");

      expect(error instanceof SearchError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    test("should maintain error properties after serialization", () => {
      const original = new SearchError("tavily", "network_error", "Connection lost", 503);
      const serialized = JSON.stringify(original);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.name).toBe("SearchError");
      expect(deserialized.engineId).toBe("tavily");
      expect(deserialized.reason).toBe("network_error");
      expect(deserialized.statusCode).toBe(503);
    });
  });
});

// Type guard tests
describe("Type Guards", () => {
  describe("isSearchError", () => {
    test("should identify SearchError instances", () => {
      const error = new SearchError("tavily", "api_error", "Test");
      const result = isSearchError(error);
      expect(result).toBe(true);
    });

    test("should reject non-SearchError objects", () => {
      const regularError = new Error("Regular error");
      const result = isSearchError(regularError);
      expect(result).toBe(false);
    });

    test("should reject null and undefined", () => {
      expect(isSearchError(null)).toBe(false);
      expect(isSearchError(undefined)).toBe(false);
    });
  });
});

// Helper function for type guard testing
function isSearchError(error: unknown): error is SearchError {
  return error instanceof SearchError;
}

// Utility type tests
describe("Type Utilities", () => {
  test("SearchQuery should be compatible with required fields", () => {
    const query: SearchQuery = {
      query: "test",
    };

    // Should compile without errors
    const queryString: string = query.query;
    expect(queryString).toBe("test");
  });

  test("SearchResultItem should preserve sourceEngine type", () => {
    const item: SearchResultItem = {
      title: "Test",
      url: "https://test.com",
      snippet: "Test",
      sourceEngine: "tavily" as EngineId,
    };

    const engineId: EngineId = item.sourceEngine;
    expect(engineId).toBe("tavily");
  });

  test("SearchResponse should maintain engine consistency", () => {
    const response: SearchResponse = {
      engineId: "brave",
      items: [
        {
          title: "Test",
          url: "https://test.com",
          snippet: "Test",
          sourceEngine: "brave",
        },
      ],
      tookMs: 100,
    };

    expect(response.engineId).toBe("brave");
    expect(response.items[0]!.sourceEngine).toBe("brave");
  });
});
