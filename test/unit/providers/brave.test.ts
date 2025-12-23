/**
 * Comprehensive Brave Provider Tests
 *
 * Tests for src/providers/brave.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SearchQuery } from "../../src/core/types";
import { SearchError } from "../../src/core/types";
import { BraveProvider } from "../../src/providers/brave";

// Store original process state
const originalProcess = process;

describe("BraveProvider", () => {
  let provider: BraveProvider;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      id: "brave",
      displayName: "Brave Search",
      apiKeyEnv: "BRAVE_API_KEY",
      endpoint: "https://api.search.brave.com/res/v1/web/search",
      defaultLimit: 10,
    };
    provider = new BraveProvider(mockConfig);
  });

  afterEach(() => {
    global.process = originalProcess;
  });

  describe("Constructor and Metadata", () => {
    test("should initialize with correct config", () => {
      expect(provider.id).toBe("brave");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        id: "brave",
        displayName: "Brave Search",
        docsUrl: "https://api.search.brave.com/app/documentation",
      });
    });

    test("should handle different config values", () => {
      const customConfig = {
        id: "custom-brave",
        displayName: "Custom Brave",
        apiKeyEnv: "CUSTOM_BRAVE_KEY",
        endpoint: "https://custom.api.com/search",
        defaultLimit: 20,
      };
      const customProvider = new BraveProvider(customConfig);

      expect(customProvider.id).toBe("custom-brave");
      const metadata = customProvider.getMetadata();
      expect(metadata.displayName).toBe("Custom Brave");
    });
  });

  describe("Search Functionality", () => {
    test("should search successfully with valid API key", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Test Result",
                url: "https://example.com",
                description: "Test description",
              },
            ],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.engineId).toBe("brave");
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toEqual({
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test description",
        score: undefined,
        sourceEngine: "brave",
      });
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
      expect(response.raw).toBeUndefined();
    });

    test("should include raw response when requested", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      const mockResponseData = {
        web: {
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              description: "Test description",
            },
          ],
        },
        rawField: "raw data",
      };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => mockResponseData,
      }));

      const query: SearchQuery = {
        query: "test query",
        limit: 5,
        includeRaw: true,
      };
      const response = await provider.search(query);

      expect(response.raw).toEqual(mockResponseData);
    });

    test("should handle results without web wrapper", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              description: "Test description",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items).toHaveLength(1);
    });

    test("should handle result with snippet field", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Test Result",
                url: "https://example.com",
                snippet: "Snippet field",
              },
            ],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Snippet field");
    });

    test("should handle result with abstract field", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Test Result",
                url: "https://example.com",
                abstract: "Abstract field",
              },
            ],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Abstract field");
    });

    test("should handle result with rank field", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Test Result",
                url: "https://example.com",
                description: "Test",
                rank: 1,
              },
            ],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(1);
    });

    test("should handle result with score field", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Test Result",
                url: "https://example.com",
                description: "Test",
                score: 0.95,
              },
            ],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(0.95);
    });

    test("should use default limit when not specified", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async (url) => {
        expect(url).toContain("count=10"); // Default limit
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: "test query" };
      await expect(provider.search(query)).rejects.toThrow();
    });

    test("should use query limit when specified", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async (url) => {
        expect(url).toContain("count=5");
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: "test query", limit: 5 };
      await expect(provider.search(query)).rejects.toThrow();
    });

    test("should use query string in request", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async (url) => {
        expect(url).toContain("q=specific+test+query");
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: "specific test query" };
      await expect(provider.search(query)).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    test("should throw error when API key is missing", async () => {
      global.process.env = {};

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: BRAVE_API_KEY",
      );
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: BRAVE_API_KEY",
      );
    });

    test("should throw error when API key is empty string", async () => {
      global.process.env = { BRAVE_API_KEY: "" };

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
    });

    test("should handle network errors", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => {
        throw new Error("Network error: connection refused");
      });

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Network error: Network error: connection refused",
      );
      await expect(provider.search(query)).rejects.toThrow("connection refused");
    });

    test("should handle HTTP 401 Unauthorized", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 401 Unauthorized");
    });

    test("should handle HTTP 429 Too Many Requests", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 429 Too Many Requests");
    });

    test("should handle invalid JSON response", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Invalid JSON response from Brave: Unexpected token in JSON",
      );
      await expect(provider.search(query)).rejects.toThrow("Invalid JSON response");
    });

    test("should handle empty results array", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: [],
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Brave returned no results");
    });

    test("should handle non-array results", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          web: {
            results: "not an array",
          },
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Brave returned no results");
    });
  });

  describe("Edge Cases", () => {
    test("should handle very long query", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      const longQuery = "a".repeat(10000);
      global.fetch = mock(async (url) => {
        expect(url).toContain(encodeURIComponent(longQuery));
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: longQuery };
      await expect(provider.search(query)).rejects.toThrow();
    });

    test("should handle query with special characters", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      const specialQuery = "test with special chars: @#$%^&*()";
      global.fetch = mock(async (url) => {
        expect(url).toContain("q=");
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: specialQuery };
      await expect(provider.search(query)).rejects.toThrow();
    });

    test("should handle empty query string", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async (url) => {
        expect(url).toContain("q=");
        return {
          ok: true,
          json: async () => ({ web: { results: [] } }),
        };
      });

      const query: SearchQuery = { query: "" };
      await expect(provider.search(query)).rejects.toThrow();
    });
  });

  describe("Integration Tests", () => {
    test("should perform complete search workflow", async () => {
      global.process.env = { BRAVE_API_KEY: "test-api-key" };

      global.fetch = mock(async (url, options) => {
        expect(url).toContain("q=TypeScript+ORM");
        expect(url).toContain("count=10");
        expect(options?.headers?.["X-Subscription-Token"]).toBe("test-api-key");

        return {
          ok: true,
          json: async () => ({
            web: {
              results: [
                {
                  title: "TypeORM - Amazing ORM for TypeScript",
                  url: "https://typeorm.io",
                  description: "TypeORM is an ORM that can run in NodeJS",
                  rank: 1,
                },
                {
                  title: "Prisma vs TypeORM Comparison",
                  url: "https://example.com/prisma-vs-typeorm",
                  description: "A detailed comparison",
                },
              ],
            },
          }),
        };
      });

      const query: SearchQuery = {
        query: "TypeScript ORM",
        limit: 10,
        includeRaw: true,
      };
      const response = await provider.search(query);

      expect(response.engineId).toBe("brave");
      expect(response.items).toHaveLength(2);
      expect(response.items[0].title).toBe("TypeORM - Amazing ORM for TypeScript");
      expect(response.items[0].url).toBe("https://typeorm.io");
      expect(response.items[0].snippet).toContain("TypeORM is an ORM");
      expect(response.items[0].score).toBe(1);
      expect(response.items[0].sourceEngine).toBe("brave");
      expect(response.raw).toBeDefined();
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });
  });
});
