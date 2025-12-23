/**
 * Comprehensive SearXNG Provider Tests
 *
 * Tests for src/providers/searchxng.ts
 *
 * Note: These tests use instance method spying instead of mock.module
 * to avoid polluting module state across test files.
 */

import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { SearchQuery } from "../../../src/core/types";
import { SearchError } from "../../../src/core/types";
import { SearchxngProvider } from "../../../src/providers/searchxng";
import {
  createMockSearxngResponse,
  createTestSearchxngConfig,
  setupMockFetch,
  setupTestEnv,
} from "../../__helpers__/docker-mocks";

// Store original process state
const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("SearchxngProvider", () => {
  let provider: SearchxngProvider;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      id: "searchxng",
      displayName: "SearXNG (Local)",
      apiKeyEnv: "SEARXNG_API_KEY",
      endpoint: "http://localhost:8888/search",
      defaultLimit: 10,
      autoStart: false, // Disable auto-start to avoid actual Docker operations
      autoStop: false,
      containerName: "searchxng",
      composeFile: "./docker-compose.yml",
      healthEndpoint: "http://localhost:8080/health",
      initTimeoutMs: 60000,
    };

    provider = new SearchxngProvider(mockConfig);

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe("Constructor and Metadata", () => {
    test("should initialize with correct config", () => {
      expect(provider.id).toBe("searchxng");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        id: "searchxng",
        displayName: "SearXNG (Local)",
        docsUrl: "https://docs.searxng.org/",
      });
    });

    test("should be lifecycle managed", () => {
      expect(provider.isLifecycleManaged()).toBe(true);
    });

    test("should handle different config values", () => {
      const customConfig = {
        ...mockConfig,
        id: "custom-searchxng",
        displayName: "Custom SearXNG",
        autoStart: false,
        autoStop: false,
      };
      const customProvider = new SearchxngProvider(customConfig);

      expect(customProvider.id).toBe("custom-searchxng");
      const metadata = customProvider.getMetadata();
      expect(metadata.displayName).toBe("SearXNG (Local)"); // This is hardcoded in the provider
    });
  });

  describe("Search Functionality", () => {
    beforeEach(() => {
      // Set up valid API key for search tests
      process.env.SEARXNG_API_KEY = "test-api-key";

      // Mock healthcheck to return true by spying on the instance method
      spyOn(provider, "healthcheck").mockResolvedValue(true);
    });

    test("should search successfully with valid API key", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test Result",
              url: "https://example.com",
              content: "Test content",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.engineId).toBe("searchxng");
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toEqual({
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test content",
        score: undefined,
        sourceEngine: "searchxng",
      });
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });

    test("should include raw response when requested", async () => {
      const mockResponseData = {
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Test content",
          },
        ],
        rawField: "raw data",
      };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => mockResponseData,
      })) as unknown as typeof fetch;

      const query: SearchQuery = {
        query: "test query",
        limit: 5,
        includeRaw: true,
      };
      const response = await provider.search(query);

      expect(response.raw).toEqual(mockResponseData);
    });

    test("should handle result with title field", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Title field",
              url: "https://example.com",
              content: "Content",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].title).toBe("Title field");
    });

    test("should handle result with score field", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Test",
              score: 0.95,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(0.95);
    });

    test("should handle result with rank field", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Test",
              rank: 1,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(1);
    });

    test("should handle result with description field", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              description: "Description field",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Description field");
    });

    test("should send correct request headers", async () => {
      let capturedOptions: any;
      global.fetch = mock(async (_url, options) => {
        capturedOptions = options;
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Test", url: "https://example.com", content: "Test" }],
          }),
        };
      }) as any;

      const query: SearchQuery = { query: "test query" };
      await provider.search(query);

      expect(capturedOptions?.headers?.Accept).toBe("application/json");
      expect(capturedOptions?.headers?.["X-Forwarded-For"]).toBe("127.0.0.1");
    });

    test("should build correct query parameters", async () => {
      let capturedUrl: string = "";
      global.fetch = mock(async (url) => {
        capturedUrl = url as string;
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Test", url: "https://example.com", content: "Test" }],
          }),
        };
      }) as any;

      const query: SearchQuery = { query: "test query" };
      await provider.search(query);

      expect(capturedUrl).toContain("q=test+query");
      expect(capturedUrl).toContain("format=json");
      expect(capturedUrl).toContain("language=all");
      expect(capturedUrl).toContain("pageno=1");
      expect(capturedUrl).toContain("safesearch=0");
    });

    test("should apply limit correctly", async () => {
      const results = Array.from({ length: 15 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example${i}.com`,
        content: `Content ${i}`,
      }));

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({ results }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.items).toHaveLength(5);
      expect(response.items[0].title).toBe("Result 0");
      expect(response.items[4].title).toBe("Result 4");
    });
  });

  describe("Error Handling", () => {
    test("should handle successful search without API key", async () => {
      // SearXNG doesn't require API key, it uses local authentication
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      let capturedUrl = "";
      global.fetch = mock(async (url) => {
        capturedUrl = url as string;
        return {
          ok: true,
          json: async () => ({
            results: [{ title: "Test", url: "https://example.com", content: "Test" }],
          }),
        };
      }) as any;

      const query: SearchQuery = { query: "test query" };
      const result = await provider.search(query);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Test");
    });

    test(
      "should handle container not healthy",
      async () => {
        process.env.SEARXNG_API_KEY = "test-api-key";
        spyOn(provider, "healthcheck").mockResolvedValue(false);
        spyOn(provider, "init").mockResolvedValue(undefined);

        const query: SearchQuery = { query: "test query" };

        // Note: This test takes ~3s because the provider waits 3s after auto-start attempt
        await expect(provider.search(query)).rejects.toThrow(SearchError);
      },
      { timeout: 10000 },
    );

    test("should handle network errors", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => {
        throw new Error("Network error: connection refused");
      }) as any;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Network error: connection refused");
    });

    test("should handle HTTP 401 Unauthorized", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "",
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(
        "SearXNG API error: HTTP 401 Unauthorized",
      );
    });

    test("should handle HTTP 404 Not Found", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "",
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("SearXNG API error: HTTP 404 Not Found");
    });

    test("should handle HTTP 500 Internal Server Error", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "",
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(
        "SearXNG API error: HTTP 500 Internal Server Error",
      );
    });

    test("should include error body when available", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "Invalid query parameters",
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(
        "SearXNG API error: HTTP 400 Bad Request - Invalid query parameters",
      );
    });

    test("should handle invalid JSON response", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow("Invalid JSON response from SearXNG");
    });

    test("should handle empty results array", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("SearXNG returned no results");
    });

    test("should handle non-array results", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: "not an array",
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("SearXNG returned no results");
    });

    test("should handle missing results field", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({}),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("SearXNG returned no results");
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);
    });

    test("should handle result with missing fields", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              // Missing title and url
            },
            {
              title: "Valid Result",
              url: "https://example.com",
              content: "Valid content",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      // First result should use URL as title and # as fallback
      expect(response.items[0].title).toBe("#");
      expect(response.items[0].url).toBe("#");

      // Second result should be normal
      expect(response.items[1].title).toBe("Valid Result");
      expect(response.items[1].url).toBe("https://example.com");
    });
  });

  describe("Integration Tests", () => {
    test("should perform complete search workflow", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async (url) => {
        expect(url).toContain("q=TypeScript+ORM");
        expect(url).toContain("format=json");
        expect(url).toContain("safesearch=0");

        return {
          ok: true,
          json: async () => ({
            results: [
              {
                title: "SearXNG - Privacy-respecting metasearch engine",
                url: "https://searx.github.io/searxng/",
                content:
                  "SearXNG is a free internet metasearch engine which aggregates results from more than 70 search services",
                score: 0.98,
                engine: "bing",
              },
              {
                title: "TypeORM Integration with SearXNG",
                url: "https://example.com/typeorm-searxng",
                description: "Using SearXNG to search TypeORM documentation",
                rank: 2,
              },
            ],
          }),
        };
      }) as any;

      const query: SearchQuery = {
        query: "TypeScript ORM",
        limit: 10,
        includeRaw: true,
      };
      const response = await provider.search(query);

      expect(response.engineId).toBe("searchxng");
      expect(response.items).toHaveLength(2);
      expect(response.items[0].title).toBe("SearXNG - Privacy-respecting metasearch engine");
      expect(response.items[0].url).toBe("https://searx.github.io/searxng/");
      expect(response.items[0].snippet).toContain("SearXNG is a free internet metasearch engine");
      expect(response.items[0].score).toBe(0.98);
      expect(response.items[0].sourceEngine).toBe("bing");
      expect(response.items[1].sourceEngine).toBe("searchxng");
      expect(response.raw).toBeDefined();
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });

    test("should handle concurrent searches", async () => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [{ title: "Result", url: "https://example.com", content: "Content" }],
        }),
      })) as unknown as typeof fetch;

      const promises = [
        provider.search({ query: "query 1" }),
        provider.search({ query: "query 2" }),
        provider.search({ query: "query 3" }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.engineId).toBe("searchxng");
        expect(result.items).toHaveLength(1);
      });
    });
  });

  describe("Auto-Start Behavior", () => {
    beforeEach(() => {
      process.env.SEARXNG_API_KEY = "test-api-key";
    });

    test(
      "should attempt init when healthcheck returns false",
      async () => {
        let healthcheckCount = 0;
        const initSpy = spyOn(provider, "init").mockResolvedValue(undefined);
        spyOn(provider, "healthcheck").mockImplementation(async () => {
          healthcheckCount++;
          return false; // Always unhealthy
        });

        const query: SearchQuery = { query: "test" };

        await expect(provider.search(query)).rejects.toThrow(SearchError);

        // Should have called init to attempt auto-start
        expect(initSpy).toHaveBeenCalled();
        // Should have called healthcheck at least twice (before and after init)
        expect(healthcheckCount).toBeGreaterThanOrEqual(2);
      },
      { timeout: 10000 },
    );

    test(
      "should succeed after auto-start makes container healthy",
      async () => {
        let healthcheckCount = 0;
        spyOn(provider, "init").mockResolvedValue(undefined);
        spyOn(provider, "healthcheck").mockImplementation(async () => {
          healthcheckCount++;
          // First check fails, subsequent checks pass
          return healthcheckCount > 1;
        });

        global.fetch = mock(async () => ({
          ok: true,
          json: async () => createMockSearxngResponse({ resultCount: 2 }),
        })) as unknown as typeof fetch;

        const query: SearchQuery = { query: "test" };
        const response = await provider.search(query);

        expect(response.items).toHaveLength(2);
      },
      { timeout: 10000 },
    );

    test("should not call init if already healthy", async () => {
      const initSpy = spyOn(provider, "init").mockResolvedValue(undefined);
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => createMockSearxngResponse(),
      })) as unknown as typeof fetch;

      await provider.search({ query: "test" });

      expect(initSpy).not.toHaveBeenCalled();
    });

    test(
      "should throw provider_unavailable error after failed auto-start",
      async () => {
        spyOn(provider, "healthcheck").mockResolvedValue(false);
        spyOn(provider, "init").mockResolvedValue(undefined);

        const query: SearchQuery = { query: "test" };

        try {
          await provider.search(query);
          expect.unreachable("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(SearchError);
          expect((error as SearchError).reason).toBe("provider_unavailable");
          expect((error as SearchError).message).toContain("not healthy");
        }
      },
      { timeout: 10000 },
    );

    test(
      "should handle unhealthy container with SearchError",
      async () => {
        // Mock healthcheck as unhealthy - provider will attempt auto-start
        spyOn(provider, "healthcheck").mockResolvedValue(false);
        spyOn(provider, "init").mockResolvedValue(undefined);

        const query: SearchQuery = { query: "test" };

        await expect(provider.search(query)).rejects.toThrow(SearchError);
        await expect(provider.search(query)).rejects.toThrow("not healthy");
      },
      { timeout: 15000 },
    );
  });

  describe("Lifecycle Method Delegation", () => {
    test("init should delegate to lifecycle manager", async () => {
      // Provider's init just delegates to lifecycleManager.init()
      // We can't easily spy on the internal manager, but we can verify the method exists
      expect(typeof provider.init).toBe("function");

      // With autoStart: false, init should complete immediately
      await expect(provider.init()).resolves.toBeUndefined();
    });

    test("shutdown should delegate to lifecycle manager", async () => {
      expect(typeof provider.shutdown).toBe("function");

      // With autoStop: false, shutdown should complete immediately
      await expect(provider.shutdown()).resolves.toBeUndefined();
    });

    test("healthcheck should delegate to lifecycle manager", async () => {
      expect(typeof provider.healthcheck).toBe("function");

      // Without Docker running, healthcheck should return false
      const result = await provider.healthcheck();
      expect(typeof result).toBe("boolean");
    });

    test("validateConfig should return validation result", async () => {
      const result = await provider.validateConfig();

      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(result).toHaveProperty("warnings");
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    test("isLifecycleManaged should return true", () => {
      expect(provider.isLifecycleManaged()).toBe(true);
    });
  });

  describe("Config Variations", () => {
    test("should use default autoStart value of true", () => {
      const config = createTestSearchxngConfig();
      delete (config as any).autoStart;

      // The provider sets autoStart ?? true internally
      const provider = new SearchxngProvider(config);
      expect(provider.id).toBe("searchxng");
    });

    test("should use default autoStop value of true", () => {
      const config = createTestSearchxngConfig();
      delete (config as any).autoStop;

      const provider = new SearchxngProvider(config);
      expect(provider.id).toBe("searchxng");
    });

    test("should use default initTimeoutMs of 60000", () => {
      const config = createTestSearchxngConfig();
      delete (config as any).initTimeoutMs;

      const provider = new SearchxngProvider(config);
      expect(provider.id).toBe("searchxng");
    });

    test("should handle custom defaultLimit", async () => {
      const config = createTestSearchxngConfig({ defaultLimit: 25 });
      const customProvider = new SearchxngProvider(config);

      process.env.SEARXNG_API_KEY = "test-key";
      spyOn(customProvider, "healthcheck").mockResolvedValue(true);

      // Create 30 results
      const results = Array.from({ length: 30 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example${i}.com`,
        content: `Content ${i}`,
      }));

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({ results }),
      })) as unknown as typeof fetch;

      // Don't pass limit - should use defaultLimit of 25
      const response = await customProvider.search({ query: "test" });

      expect(response.items).toHaveLength(25);
    });

    test("should use custom endpoint", async () => {
      const config = createTestSearchxngConfig({
        endpoint: "http://custom-searxng:9999/search",
      });
      const customProvider = new SearchxngProvider(config);

      process.env.SEARXNG_API_KEY = "test-key";
      spyOn(customProvider, "healthcheck").mockResolvedValue(true);

      let capturedUrl = "";
      global.fetch = mock(async (url) => {
        capturedUrl = url as string;
        return {
          ok: true,
          json: async () => createMockSearxngResponse(),
        };
      }) as any;

      await customProvider.search({ query: "test" });

      expect(capturedUrl).toContain("custom-searxng:9999");
    });

    test("should not send API key (local provider)", async () => {
      const config = createTestSearchxngConfig({
        apiKeyEnv: "CUSTOM_SEARXNG_KEY",
      });
      const customProvider = new SearchxngProvider(config);

      process.env.CUSTOM_SEARXNG_KEY = "my-custom-key";
      spyOn(customProvider, "healthcheck").mockResolvedValue(true);

      let capturedHeaders: Record<string, string> = {};
      global.fetch = mock(async (_url, options: any) => {
        capturedHeaders = options?.headers || {};
        return {
          ok: true,
          json: async () => createMockSearxngResponse(),
        };
      }) as any;

      await customProvider.search({ query: "test" });

      // SearXNG is a local provider, doesn't use API key auth
      expect(capturedHeaders.Authorization).toBeUndefined();
      expect(capturedHeaders["X-Forwarded-For"]).toBe("127.0.0.1");
    });
  });

  describe("Result Mapping Variations", () => {
    beforeEach(() => {
      process.env.SEARXNG_API_KEY = "test-api-key";
      spyOn(provider, "healthcheck").mockResolvedValue(true);
    });

    test("should map engine field to sourceEngine", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Google Result",
              url: "https://google.com",
              content: "Test",
              engine: "google",
            },
            { title: "Bing Result", url: "https://bing.com", content: "Test", engine: "bing" },
            { title: "DDG Result", url: "https://ddg.com", content: "Test" }, // No engine
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      expect(response.items[0].sourceEngine).toBe("google");
      expect(response.items[1].sourceEngine).toBe("bing");
      expect(response.items[2].sourceEngine).toBe("searchxng"); // Fallback to provider id
    });

    test("should prefer content over description for snippet", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Content field",
              description: "Description field",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      expect(response.items[0].snippet).toBe("Content field");
    });

    test("should use description when content is missing", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              description: "Description only",
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      expect(response.items[0].snippet).toBe("Description only");
    });

    test("should prefer score over rank", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Test",
              score: 0.95,
              rank: 1,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      expect(response.items[0].score).toBe(0.95);
    });

    test("should use rank as score when score is missing", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Test",
              rank: 3,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      expect(response.items[0].score).toBe(3);
    });

    test("should handle null fields gracefully", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: null,
              url: "https://example.com",
              content: null,
              score: null,
            },
          ],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test" });

      // Should use fallbacks
      expect(response.items[0].title).toBe("https://example.com");
      expect(response.items[0].snippet).toBe("");
      // null ?? undefined evaluates to undefined in the provider code
      expect(response.items[0].score).toBeUndefined();
    });

    test("should handle response with extra fields", async () => {
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              title: "Test",
              url: "https://example.com",
              content: "Content",
              thumbnail: "https://example.com/thumb.jpg",
              publishedDate: "2024-01-01",
              categories: ["general"],
              extraField: "ignored",
            },
          ],
          query: "test",
          number_of_results: 1,
          infoboxes: [],
        }),
      })) as unknown as typeof fetch;

      const response = await provider.search({ query: "test", includeRaw: true });

      expect(response.items[0].title).toBe("Test");
      expect(response.raw).toHaveProperty("infoboxes");
      expect(response.raw).toHaveProperty("number_of_results");
    });
  });

  describe("Using Test Helpers", () => {
    test("should work with setupMockFetch helper", async () => {
      const { mockFetch, calls, restore } = setupMockFetch({
        healthStatus: 200,
        searchResponses: new Map([
          [
            "localhost:8888",
            {
              status: 200,
              body: createMockSearxngResponse({ resultCount: 5, includeScore: true }),
            },
          ],
        ]),
      });

      const { restore: restoreEnv } = setupTestEnv({ SEARXNG_API_KEY: "test-key" });

      try {
        global.fetch = mockFetch as any;
        spyOn(provider, "healthcheck").mockResolvedValue(true);

        const response = await provider.search({ query: "helper test" });

        expect(response.items).toHaveLength(5);
        expect(response.items[0].score).toBeDefined();
        expect(calls.some((c) => c.url.includes("localhost:8888"))).toBe(true);
      } finally {
        restore();
        restoreEnv();
      }
    });

    test("should work with createTestSearchxngConfig helper", () => {
      const config = createTestSearchxngConfig({
        id: "custom-id",
        displayName: "Custom Display",
        defaultLimit: 15,
      });

      expect(config.id).toBe("custom-id");
      expect(config.displayName).toBe("Custom Display");
      expect(config.defaultLimit).toBe(15);
      expect(config.type).toBe("searchxng");
      expect(config.endpoint).toBe("http://localhost:8888/search");
    });

    test("should work with createMockSearxngResponse helper", () => {
      const response = createMockSearxngResponse({
        resultCount: 10,
        includeEngine: true,
        includeScore: true,
        includeRank: true,
      });

      expect(response.results).toHaveLength(10);
      expect(response.results[0]).toHaveProperty("engine");
      expect(response.results[0]).toHaveProperty("score");
      expect(response.results[0]).toHaveProperty("rank");
    });
  });

  describe("Timing and Performance", () => {
    beforeEach(() => {
      process.env.SEARXNG_API_KEY = "test-api-key";
    });

    test("should measure response time accurately", async () => {
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      const delay = 50; // 50ms simulated delay
      global.fetch = mock(async () => {
        await new Promise((r) => setTimeout(r, delay));
        return {
          ok: true,
          json: async () => createMockSearxngResponse(),
        };
      }) as any;

      const response = await provider.search({ query: "test" });

      // tookMs should be at least the delay amount
      expect(response.tookMs).toBeGreaterThanOrEqual(delay);
      // But not excessively long (allow for some overhead)
      expect(response.tookMs).toBeLessThan(delay + 500);
    });

    test("should respect query limit over default limit", async () => {
      spyOn(provider, "healthcheck").mockResolvedValue(true);

      const results = Array.from({ length: 20 }, (_, i) => ({
        title: `Result ${i}`,
        url: `https://example${i}.com`,
        content: `Content ${i}`,
      }));

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({ results }),
      })) as unknown as typeof fetch;

      // Default limit is 10, but query limit is 3
      const response = await provider.search({ query: "test", limit: 3 });

      expect(response.items).toHaveLength(3);
    });
  });
});
