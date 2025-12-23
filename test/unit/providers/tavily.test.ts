/**
 * Comprehensive Tavily Provider Tests
 *
 * Tests for src/providers/tavily.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { TavilyConfig } from "../../src/config/types";
import type { SearchQuery } from "../../src/core/types";
import { SearchError } from "../../src/core/types";
import { TavilyProvider } from "../../src/providers/tavily";

// Store original process state
const originalProcess = process;

describe("TavilyProvider", () => {
  let provider: TavilyProvider;
  let mockConfig: TavilyConfig;

  beforeEach(() => {
    mockConfig = {
      id: "tavily",
      type: "tavily",
      enabled: true,
      displayName: "Tavily Search",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 10,
      apiKeyEnv: "TAVILY_API_KEY",
      searchDepth: "advanced" as const,
      endpoint: "https://api.tavily.com/search",
    };
    provider = new TavilyProvider(mockConfig);
  });

  afterEach(() => {
    global.process = originalProcess;
  });

  describe("Constructor and Metadata", () => {
    test("should initialize with correct config", () => {
      expect(provider.id).toBe("tavily");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        id: "tavily",
        displayName: "Tavily Search",
        docsUrl: "https://docs.tavily.com/",
      });
    });

    test("should handle different config values", () => {
      const customConfig: any = {
        id: "custom-tavily",
        type: "tavily" as const,
        enabled: true,
        displayName: "Custom Tavily",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 10,
        apiKeyEnv: "CUSTOM_TAVILY_KEY",
        searchDepth: "basic" as const,
        endpoint: "https://custom.api.com/search",
      };
      const customProvider = new TavilyProvider(customConfig);

      expect(customProvider.id).toBe("custom-tavily");
      const metadata = customProvider.getMetadata();
      expect(metadata.displayName).toBe("Custom Tavily");
    });
  });

  describe("Search Functionality", () => {
    test("should search successfully with valid API key", async () => {
      // Mock environment
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      // Mock fetch response
      global.fetch = mock(async (_url: RequestInfo | URL, _options?: RequestInit) => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              content: "Test content",
              score: 0.95,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.engineId).toBe("tavily");
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toEqual({
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test content",
        score: 0.95,
        sourceEngine: "tavily",
      });
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
      expect(response.raw).toBeUndefined(); // includeRaw is false
    });

    test("should include raw response when requested", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const mockResponseData = {
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Test content",
            score: 0.95,
          },
        ],
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

    test("should handle result without score", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              content: "Test content",
              // no score field
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBeUndefined();
    });

    test("should handle result with missing title", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              url: "https://example.com",
              content: "Test content",
              score: 0.95,
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].title).toBe("https://example.com"); // Should fall back to URL
    });

    test("should handle result with content vs snippet", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              content: "Content field",
              snippet: "Snippet field",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Content field"); // Should prefer content
    });

    test("should handle result with only snippet", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              snippet: "Only snippet field",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Only snippet field");
    });

    test("should handle result with empty fields", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "",
              url: "https://example.com",
              content: "",
              snippet: "",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].title).toBe("");
      expect(response.items[0].snippet).toBe("");
    });

    test("should handle multiple results", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Result 1",
              url: "https://example1.com",
              content: "Content 1",
            },
            {
              title: "Result 2",
              url: "https://example2.com",
              content: "Content 2",
            },
            {
              title: "Result 3",
              url: "https://example3.com",
              content: "Content 3",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items).toHaveLength(3);
      expect(response.items[0].title).toBe("Result 1");
      expect(response.items[1].title).toBe("Result 2");
      expect(response.items[2].title).toBe("Result 3");
    });

    test("should respect limit parameter", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            { title: "Result 1", url: "https://example1.com", content: "Content 1" },
            { title: "Result 2", url: "https://example2.com", content: "Content 2" },
            { title: "Result 3", url: "https://example3.com", content: "Content 3" },
            { title: "Result 4", url: "https://example4.com", content: "Content 4" },
            { title: "Result 5", url: "https://example5.com", content: "Content 5" },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query", limit: 3 };
      const response = await provider.search(query);

      // Note: The provider doesn't limit results - it requests limit from API
      // But the result mapping should still handle the returned data
      expect(response.items).toHaveLength(5);
    });

    test("should use default limit when not specified", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.max_results).toBe(5); // Default limit
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", content: "Test" }],
          }),
        };
      });

      const query: SearchQuery = { query: "test query" };
      await provider.search(query);
    });

    test("should use query string in request", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe("specific test query");
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", content: "Test" }],
          }),
        };
      });

      const query: SearchQuery = { query: "specific test query" };
      await provider.search(query);
    });
  });

  describe("Error Handling", () => {
    test("should throw error when API key is missing", async () => {
      global.process.env = {}; // No API key

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: TAVILY_API_KEY",
      );
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: TAVILY_API_KEY",
      );
    });

    test("should throw error when API key environment variable is different", async () => {
      const customConfig = {
        id: "custom-tavily",
        displayName: "Custom Tavily",
        apiKeyEnv: "CUSTOM_TAVILY_KEY",
        searchDepth: "basic" as const,
        endpoint: "https://api.tavily.com/search",
      };
      const customProvider = new TavilyProvider(customConfig);

      global.process.env = { TAVILY_API_KEY: "test-key" }; // Wrong key name

      const query: SearchQuery = { query: "test query" };

      await expect(customProvider.search(query)).rejects.toThrow(
        "Missing environment variable: CUSTOM_TAVILY_KEY",
      );
    });

    test("should throw error when API key is empty string", async () => {
      global.process.env = { TAVILY_API_KEY: "" };

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
    });

    test("should handle network errors", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

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

    test("should handle timeout errors", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => {
        throw new Error("Request timeout");
      });

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Network error: Request timeout");
    });

    test("should handle DNS resolution errors", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.tavily.com");
      });

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("ENOTFOUND");
    });

    test("should handle HTTP 400 Bad Request", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Tavily API error: HTTP 400 Bad Request",
      );
      await expect(provider.search(query)).rejects.toThrow("HTTP 400 Bad Request");
    });

    test("should handle HTTP 401 Unauthorized", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 401 Unauthorized");
    });

    test("should handle HTTP 403 Forbidden", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 403 Forbidden");
    });

    test("should handle HTTP 429 Too Many Requests", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 429 Too Many Requests");
    });

    test("should handle HTTP 500 Internal Server Error", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 500 Internal Server Error");
    });

    test("should handle HTTP 502 Bad Gateway", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 502 Bad Gateway");
    });

    test("should handle HTTP 503 Service Unavailable", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 503 Service Unavailable");
    });

    test("should handle invalid JSON response", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Invalid JSON response from Tavily");
    });

    test("should handle empty JSON response", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({}),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Tavily returned no results");
    });

    test("should handle empty results array", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [],
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      // Empty results should throw an error
      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Tavily returned no results");
    });

    test("should handle non-array results", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: "not an array",
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Tavily returned no results");
    });

    test("should handle malformed result objects", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            null,
            undefined,
            {},
            { url: "https://example.com" }, // Missing required fields
            { title: "Valid Title", url: "https://valid.com", content: "Valid content" },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      // Should handle gracefully and map valid results
      const response = await provider.search(query);
      expect(response.items).toHaveLength(1);
      expect(response.items[0].title).toBe("Valid Title");
    });
  });

  describe("Edge Cases and Special Characters", () => {
    // Helper to create a valid mock result
    const validResult = { title: "Result", url: "https://example.com", content: "Test content" };

    test("should handle very long query", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const longQuery = "a".repeat(10000);
      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe(longQuery);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: longQuery };
      await provider.search(query);
    });

    test("should handle query with special characters", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const specialQuery = "test with special chars: @#$%^&*()[]{}|\\:;\"'<>?,./";
      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe(specialQuery);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: specialQuery };
      await provider.search(query);
    });

    test("should handle query with unicode characters", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const unicodeQuery = "test with unicode: ñiño 日本 🚀";
      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe(unicodeQuery);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: unicodeQuery };
      await provider.search(query);
    });

    test("should handle empty query string", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe("");
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: "" };
      await provider.search(query);
    });

    test("should handle whitespace-only query", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe("   ");
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: "   " };
      await provider.search(query);
    });

    test("should handle query with newlines and tabs", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const newlineQuery = "test\nquery\twith\n\tnewlines";
      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.query).toBe(newlineQuery);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: newlineQuery };
      await provider.search(query);
    });

    test("should handle zero limit", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.max_results).toBe(0);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: "test query", limit: 0 };
      await provider.search(query);
    });

    test("should handle negative limit", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.max_results).toBe(-1);
        return {
          ok: true,
          json: async () => ({ results: [validResult] }),
        };
      });

      const query: SearchQuery = { query: "test query", limit: -1 };
      await provider.search(query);
    });
  });

  describe("Integration Tests", () => {
    test("should perform complete search workflow", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);

        // Verify request structure
        expect(body.api_key).toBe("test-api-key");
        expect(body.query).toBe("TypeScript ORM");
        expect(body.max_results).toBe(10);
        expect(body.search_depth).toBe("advanced");
        expect(body.include_answer).toBe(false);
        expect(body.include_raw_content).toBe(false);
        expect(body.include_images).toBe(false);

        return {
          ok: true,
          json: async () => ({
            results: [
              {
                title: "TypeORM - Amazing ORM for TypeScript",
                url: "https://typeorm.io",
                content:
                  "TypeORM is an ORM that can run in NodeJS, Browser, Cordova, PhoneGap, Ionic, React Native, NativeScript, Expo and Electron platforms",
                score: 0.98,
              },
              {
                title: "Prisma vs TypeORM Comparison",
                url: "https://example.com/prisma-vs-typeorm",
                content: "A detailed comparison of Prisma and TypeORM for TypeScript development",
              },
            ],
          }),
        };
      });

      const query: SearchQuery = {
        query: "TypeScript ORM",
        limit: 10,
        includeRaw: true,
      };
      const response = await provider.search(query);

      expect(response.engineId).toBe("tavily");
      expect(response.items).toHaveLength(2);
      expect(response.items[0].title).toBe("TypeORM - Amazing ORM for TypeScript");
      expect(response.items[0].url).toBe("https://typeorm.io");
      expect(response.items[0].snippet).toContain("TypeORM is an ORM");
      expect(response.items[0].score).toBe(0.98);
      expect(response.items[0].sourceEngine).toBe("tavily");
      expect(response.raw).toBeDefined();
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });

    test("should handle concurrent searches", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [{ title: "Result", url: "https://example.com", content: "Content" }],
        }),
      }));

      const promises = [
        provider.search({ query: "query 1" }),
        provider.search({ query: "query 2" }),
        provider.search({ query: "query 3" }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.engineId).toBe("tavily");
        expect(result.items).toHaveLength(1);
      }
    });

    test("should handle rapid successive requests", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      let requestCount = 0;
      global.fetch = mock(async () => {
        requestCount++;
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                title: `Result ${requestCount}`,
                url: `https://example${requestCount}.com`,
                content: "Content",
              },
            ],
          }),
        };
      });

      for (let i = 0; i < 10; i++) {
        await provider.search({ query: `query ${i}` });
      }

      expect(requestCount).toBe(10);
    });
  });

  describe("Performance Tests", () => {
    test("should measure timing accurately", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const _startTime = Date.now();
      global.fetch = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate 50ms delay
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Result", url: "https://example.com", content: "Content" }],
          }),
        };
      });

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.tookMs).toBeGreaterThanOrEqual(40);
      expect(response.tookMs).toBeLessThan(100);
    });

    test("should handle large number of results efficiently", async () => {
      global.process.env = { TAVILY_API_KEY: "test-api-key" };

      const largeResults = Array(1000)
        .fill(null)
        .map((_, i) => ({
          title: `Result ${i}`,
          url: `https://example${i}.com`,
          content: `Content for result ${i}`,
          score: 1.0 - i / 1000,
        }));

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: largeResults,
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items).toHaveLength(1000);
      expect(response.items[0].title).toBe("Result 0");
      expect(response.items[999].title).toBe("Result 999");
    });
  });
});
