/**
 * Comprehensive Linkup Provider Tests
 *
 * Tests for src/providers/linkup.ts
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { SearchQuery } from "../../../src/core/types";
import { SearchError } from "../../../src/core/types";
import { LinkupProvider } from "../../../src/providers/linkup";

// Store original process state
const originalProcess = process;

describe("LinkupProvider", () => {
  let provider: LinkupProvider;
  let mockConfig: any;

  beforeEach(() => {
    mockConfig = {
      id: "linkup",
      displayName: "Linkup Search",
      apiKeyEnv: "LINKUP_API_KEY",
      endpoint: "https://api.linkup.so/v1/search",
      autoStart: false,
      autoStop: false,
      containerName: "linkup",
      composeFile: "./docker-compose.yml",
      healthEndpoint: "http://localhost:8080/health",
      initTimeoutMs: 30000,
    };
    provider = new LinkupProvider(mockConfig);
  });

  afterEach(() => {
    global.process = originalProcess;
  });

  describe("Constructor and Metadata", () => {
    test("should initialize with correct config", () => {
      expect(provider.id).toBe("linkup");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        id: "linkup",
        displayName: "Linkup Search",
        docsUrl: "https://docs.linkup.ai/",
      });
    });

    test("should be lifecycle managed", () => {
      expect(provider.isLifecycleManaged()).toBe(true);
    });
  });

  describe("Search Functionality", () => {
    test("should search successfully with valid API key", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Test Result",
              url: "https://example.com",
              content: "Test content",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query", limit: 5 };
      const response = await provider.search(query);

      expect(response.engineId).toBe("linkup");
      expect(response.items).toHaveLength(1);
      expect(response.items[0]).toEqual({
        title: "Test Result",
        url: "https://example.com",
        snippet: "Test content",
        score: undefined,
        sourceEngine: "linkup",
      });
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });

    test("should include raw response when requested", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      const mockResponseData = {
        results: [
          {
            name: "Test Result",
            url: "https://example.com",
            content: "Test content",
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

    test("should handle result with title field", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

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
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].title).toBe("Title field");
    });

    test("should handle result with snippet field", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Test",
              url: "https://example.com",
              snippet: "Snippet field",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Snippet field");
    });

    test("should handle result with description field", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Test",
              url: "https://example.com",
              description: "Description field",
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].snippet).toBe("Description field");
    });

    test("should handle result with score field", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Test",
              url: "https://example.com",
              content: "Test",
              score: 0.95,
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(0.95);
    });

    test("should handle result with relevance field", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [
            {
              name: "Test",
              url: "https://example.com",
              content: "Test",
              relevance: 0.88,
            },
          ],
        }),
      }));

      const query: SearchQuery = { query: "test query" };
      const response = await provider.search(query);

      expect(response.items[0].score).toBe(0.88);
    });

    test("should use default limit when not specified", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.maxResults).toBe(5); // Default limit
        return {
          ok: true,
          json: async () => ({ results: [] }),
        };
      });

      const query: SearchQuery = { query: "test query" };
      await expect(provider.search(query)).rejects.toThrow();
    });

    test("should send correct request body", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.q).toBe("specific test query");
        expect(body.depth).toBe("standard");
        expect(body.outputType).toBe("searchResults");
        expect(body.maxResults).toBe(10);
        expect(options.headers?.Authorization).toBe("Bearer test-api-key");
        return {
          ok: true,
          json: async () => ({ results: [] }),
        };
      });

      const query: SearchQuery = { query: "specific test query", limit: 10 };
      await expect(provider.search(query)).rejects.toThrow();
    });
  });

  describe("Error Handling", () => {
    test("should throw error when API key is missing", async () => {
      global.process.env = {};

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: LINKUP_API_KEY",
      );
      await expect(provider.search(query)).rejects.toThrow(
        "Missing environment variable: LINKUP_API_KEY",
      );
    });

    test("should handle network errors", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

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
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Invalid API key",
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("HTTP 401 Unauthorized");
      await expect(provider.search(query)).rejects.toThrow("Invalid API key");
    });

    test("should handle invalid JSON response", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow(SearchError);
      await expect(provider.search(query)).rejects.toThrow(
        "Invalid JSON response from Linkup: Unexpected token in JSON",
      );
      await expect(provider.search(query)).rejects.toThrow("Invalid JSON response");
    });

    test("should handle empty results array", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: [],
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Linkup returned no results");
    });

    test("should handle non-array results", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          results: "not an array",
        }),
      }));

      const query: SearchQuery = { query: "test query" };

      await expect(provider.search(query)).rejects.toThrow("Linkup returned no results");
    });
  });

  describe("Lifecycle Management", () => {
    test("should have init method", async () => {
      expect(typeof provider.init).toBe("function");
    });

    test("should have healthcheck method", async () => {
      expect(typeof provider.healthcheck).toBe("function");
    });

    test("should have shutdown method", async () => {
      expect(typeof provider.shutdown).toBe("function");
    });

    test("should have validateConfig method", async () => {
      expect(typeof provider.validateConfig).toBe("function");
    });
  });

  describe("Integration Tests", () => {
    test("should perform complete search workflow", async () => {
      global.process.env = { LINKUP_API_KEY: "test-api-key" };

      global.fetch = mock(async (_url, options) => {
        const body = JSON.parse(options.body);
        expect(body.q).toBe("TypeScript ORM");
        expect(body.maxResults).toBe(10);

        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: "TypeORM - Amazing ORM for TypeScript",
                url: "https://typeorm.io",
                content: "TypeORM is an ORM that can run in NodeJS",
                score: 0.98,
              },
              {
                title: "Prisma vs TypeORM Comparison",
                url: "https://example.com/prisma-vs-typeorm",
                description: "A detailed comparison",
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

      expect(response.engineId).toBe("linkup");
      expect(response.items).toHaveLength(2);
      expect(response.items[0].title).toBe("TypeORM - Amazing ORM for TypeScript");
      expect(response.items[0].url).toBe("https://typeorm.io");
      expect(response.items[0].snippet).toContain("TypeORM is an ORM");
      expect(response.items[0].score).toBe(0.98);
      expect(response.items[0].sourceEngine).toBe("linkup");
      expect(response.raw).toBeDefined();
      expect(response.tookMs).toBeGreaterThanOrEqual(0);
    });
  });
});
