/**
 * Comprehensive Tool Module Tests
 *
 * Tests for src/tool/multiSearchTool.ts covering multiSearch and getCreditStatus functions
 *
 * Note: Uses dependency injection (containerOverride) instead of mock.module
 * to avoid polluting module state across test files.
 */

import { describe, expect, mock, test } from "bun:test";
import { getCreditStatus, multiSearch } from "../../../src/tool/multiSearchTool";

// Create a mock container factory for testing
function createMockContainer(
  options: {
    orchestratorResponse?: any;
    orchestratorError?: Error;
    creditManagerResponse?: any;
    creditManagerError?: Error;
  } = {},
) {
  const defaultOrchestratorResponse = {
    query: "test query",
    results: [
      {
        title: "Test Result 1",
        url: "https://example1.com",
        snippet: "This is a test result 1",
        score: 0.95,
        sourceEngine: "tavily",
      },
      {
        title: "Test Result 2",
        url: "https://example2.com",
        snippet: "This is a test result 2",
        score: 0.87,
        sourceEngine: "tavily",
      },
    ],
    engineAttempts: [
      {
        engineId: "tavily",
        success: true,
      },
    ],
    credits: [
      {
        engineId: "tavily",
        quota: 1000,
        used: 5,
        remaining: 995,
        isExhausted: false,
      },
    ],
  };

  const defaultCreditManagerResponse = [
    {
      engineId: "tavily",
      quota: 1000,
      used: 5,
      remaining: 995,
      isExhausted: false,
    },
    {
      engineId: "brave",
      quota: 500,
      used: 0,
      remaining: 500,
      isExhausted: false,
    },
  ];

  return {
    get: (serviceId: string) => {
      switch (serviceId) {
        case "orchestrator":
          return {
            run: mock(async (query: string, opts: any) => {
              if (options.orchestratorError) {
                throw options.orchestratorError;
              }
              // Use 'in' check to handle explicit undefined
              const response =
                "orchestratorResponse" in options
                  ? options.orchestratorResponse
                  : defaultOrchestratorResponse;
              // Support dynamic engine override
              if (opts?.engineOrderOverride?.length) {
                return {
                  ...response,
                  query,
                  results: response.results.map((r: any) => ({
                    ...r,
                    sourceEngine: opts.engineOrderOverride[0],
                  })),
                  engineAttempts: [
                    {
                      engineId: opts.engineOrderOverride[0],
                      success: true,
                    },
                  ],
                };
              }
              return { ...response, query };
            }),
          };
        case "creditManager":
          return {
            listSnapshots: mock(async () => {
              if (options.creditManagerError) {
                throw options.creditManagerError;
              }
              // Use 'in' check to handle explicit undefined/null
              return "creditManagerResponse" in options
                ? options.creditManagerResponse
                : defaultCreditManagerResponse;
            }),
          };
        default:
          return null;
      }
    },
  };
}

describe("Tool Module Tests", () => {
  describe("multiSearch Function", () => {
    test("should execute search with default options", async () => {
      const container = createMockContainer();
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.query).toBe("test query");
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        title: "Test Result 1",
        url: "https://example1.com",
        snippet: "This is a test result 1",
        score: 0.95,
        sourceEngine: "tavily",
      });
      expect(result.items[1]).toEqual({
        title: "Test Result 2",
        url: "https://example2.com",
        snippet: "This is a test result 2",
        score: 0.87,
        sourceEngine: "tavily",
      });
      expect(result.enginesTried).toHaveLength(1);
      expect(result.enginesTried[0]).toEqual({
        engineId: "tavily",
        success: true,
        reason: undefined,
      });
    });

    test("should execute search with custom engines", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        { query: "test query", engines: ["brave", "linkup"] },
        { containerOverride: container },
      );

      expect(result.query).toBe("test query");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].sourceEngine).toBe("brave");
      expect(result.enginesTried[0].engineId).toBe("brave");
    });

    test("should execute search with first-success strategy", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        { query: "test query", strategy: "first-success" },
        { containerOverride: container },
      );

      expect(result.query).toBe("test query");
      expect(result.items).toHaveLength(2);
      expect(result.enginesTried).toHaveLength(1);
    });

    test("should execute search with limit", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        { query: "test query", limit: 5 },
        { containerOverride: container },
      );

      expect(result.query).toBe("test query");
      expect(result.items).toHaveLength(2);
    });

    test("should execute search with includeRaw", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        { query: "test query", includeRaw: true },
        { containerOverride: container },
      );

      expect(result.query).toBe("test query");
      expect(result.items).toHaveLength(2);
    });

    test("should execute search with all options", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        {
          query: "complex test query",
          engines: ["brave"],
          limit: 10,
          strategy: "first-success",
          includeRaw: true,
        },
        { containerOverride: container },
      );

      expect(result.query).toBe("complex test query");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].sourceEngine).toBe("brave");
    });

    test("should support string config path for backwards compatibility", async () => {
      // This tests the backwards compat - string arg is treated as config path
      // Since we can't easily test with real bootstrap, we verify the signature works
      const container = createMockContainer();
      const result = await multiSearch(
        { query: "test query" },
        { containerOverride: container, configPath: "/path/to/config.json" },
      );

      expect(result.query).toBe("test query");
    });

    test("should handle empty query", async () => {
      const container = createMockContainer();
      const result = await multiSearch({ query: "" }, { containerOverride: container });

      expect(result.query).toBe("");
      expect(result.items).toHaveLength(2);
    });

    test("should handle very long query", async () => {
      const longQuery = "a".repeat(10000);
      const container = createMockContainer();
      const result = await multiSearch({ query: longQuery }, { containerOverride: container });

      expect(result.query).toBe(longQuery);
    });

    test("should handle special characters in query", async () => {
      const specialQuery = "test with special chars: @#$%^&*()[]{}|\\:;\"'<>?,./";
      const container = createMockContainer();
      const result = await multiSearch({ query: specialQuery }, { containerOverride: container });

      expect(result.query).toBe(specialQuery);
    });

    test("should handle unicode characters in query", async () => {
      const unicodeQuery = "test with unicode: ñiño 日本 🚀";
      const container = createMockContainer();
      const result = await multiSearch({ query: unicodeQuery }, { containerOverride: container });

      expect(result.query).toBe(unicodeQuery);
    });

    test("should handle orchestrator execution failure", async () => {
      const container = createMockContainer({
        orchestratorError: new Error("Search execution failed"),
      });

      await expect(
        multiSearch({ query: "test query" }, { containerOverride: container }),
      ).rejects.toThrow("Search execution failed");
    });

    test("should map results correctly from orchestrator", async () => {
      const customResponse = {
        query: "test",
        results: [
          {
            title: "Mapped Result",
            url: "https://mapped.com",
            snippet: "Mapped snippet",
            score: 0.99,
            sourceEngine: "test-engine",
          },
        ],
        engineAttempts: [
          {
            engineId: "test-engine",
            success: true,
            reason: undefined,
          },
        ],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        title: "Mapped Result",
        url: "https://mapped.com",
        snippet: "Mapped snippet",
        score: 0.99,
        sourceEngine: "test-engine",
      });
      expect(result.enginesTried).toHaveLength(1);
      expect(result.enginesTried[0]).toEqual({
        engineId: "test-engine",
        success: true,
        reason: undefined,
      });
    });

    test("should handle missing score in results", async () => {
      const customResponse = {
        query: "test",
        results: [
          {
            title: "Result without score",
            url: "https://example.com",
            snippet: "Snippet",
            // score is undefined
            sourceEngine: "test-engine",
          },
        ],
        engineAttempts: [
          {
            engineId: "test-engine",
            success: true,
          },
        ],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.items[0].score).toBeUndefined();
    });

    test("should handle empty results from orchestrator", async () => {
      const customResponse = {
        query: "test",
        results: [],
        engineAttempts: [
          {
            engineId: "tavily",
            success: false,
            reason: "No results",
          },
        ],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.items).toHaveLength(0);
      expect(result.enginesTried).toHaveLength(1);
      expect(result.enginesTried[0].success).toBe(false);
    });

    test("should preserve undefined reason in engine attempts", async () => {
      const customResponse = {
        query: "test",
        results: [],
        engineAttempts: [
          {
            engineId: "tavily",
            success: false,
            reason: undefined,
          },
        ],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.enginesTried[0].reason).toBeUndefined();
    });

    test("should handle undefined credits from orchestrator", async () => {
      const customResponse = {
        query: "test",
        results: [],
        engineAttempts: [],
        credits: undefined,
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch({ query: "test query" }, { containerOverride: container });

      expect(result.credits).toBeUndefined();
    });
  });

  describe("getCreditStatus Function", () => {
    test("should return credit status successfully", async () => {
      const container = createMockContainer();
      const credits = await getCreditStatus({ containerOverride: container });

      expect(credits).toHaveLength(2);
      expect(credits?.[0]).toEqual({
        engineId: "tavily",
        quota: 1000,
        used: 5,
        remaining: 995,
        isExhausted: false,
      });
      expect(credits?.[1]).toEqual({
        engineId: "brave",
        quota: 500,
        used: 0,
        remaining: 500,
        isExhausted: false,
      });
    });

    test("should return credit status with config path option", async () => {
      const container = createMockContainer();
      const credits = await getCreditStatus({
        containerOverride: container,
        configPath: "/path/to/config.json",
      });

      expect(credits).toBeDefined();
      expect(credits).toHaveLength(2);
    });

    test("should handle credit manager failure", async () => {
      const container = createMockContainer({
        creditManagerError: new Error("Failed to list credit snapshots"),
      });

      await expect(getCreditStatus({ containerOverride: container })).rejects.toThrow(
        "Failed to list credit snapshots",
      );
    });

    test("should handle empty credit status", async () => {
      const container = createMockContainer({ creditManagerResponse: [] });
      const credits = await getCreditStatus({ containerOverride: container });

      expect(credits).toHaveLength(0);
    });

    test("should handle undefined credit status", async () => {
      const container = createMockContainer({ creditManagerResponse: undefined });
      const credits = await getCreditStatus({ containerOverride: container });

      expect(credits).toBeUndefined();
    });

    test("should handle null credit status", async () => {
      const container = createMockContainer({ creditManagerResponse: null });
      const credits = await getCreditStatus({ containerOverride: container });

      expect(credits).toBeNull();
    });
  });

  describe("Integration Tests", () => {
    test("should execute complete multiSearch workflow", async () => {
      const container = createMockContainer();
      const result = await multiSearch(
        {
          query: "TypeScript ORM 2025",
          engines: ["tavily"],
          limit: 10,
          strategy: "all",
          includeRaw: true,
        },
        { containerOverride: container },
      );

      expect(result.query).toBe("TypeScript ORM 2025");
      expect(result.items).toHaveLength(2);
      expect(result.items[0].sourceEngine).toBe("tavily");
      expect(result.enginesTried).toHaveLength(1);
      expect(result.credits).toBeDefined();
    });

    test("should execute complete getCreditStatus workflow", async () => {
      const container = createMockContainer();
      const credits = await getCreditStatus({ containerOverride: container });

      expect(credits).toBeDefined();
      expect(Array.isArray(credits)).toBe(true);
      const creditList = credits ?? [];
      for (const credit of creditList) {
        expect(credit.engineId).toBeDefined();
        expect(credit.quota).toBeGreaterThan(0);
        expect(credit.used).toBeGreaterThanOrEqual(0);
        expect(credit.remaining).toBeGreaterThanOrEqual(0);
        expect(credit.isExhausted).toBeDefined();
      }
    });

    test("should handle concurrent multiSearch calls", async () => {
      const container = createMockContainer();
      const promises = [
        multiSearch({ query: "query 1" }, { containerOverride: container }),
        multiSearch({ query: "query 2" }, { containerOverride: container }),
        multiSearch({ query: "query 3" }, { containerOverride: container }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      expect(results[0].query).toBe("query 1");
      expect(results[1].query).toBe("query 2");
      expect(results[2].query).toBe("query 3");
    });

    test("should handle concurrent getCreditStatus calls", async () => {
      const container = createMockContainer();
      const promises = [
        getCreditStatus({ containerOverride: container }),
        getCreditStatus({ containerOverride: container }),
        getCreditStatus({ containerOverride: container }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      for (const credits of results) {
        expect(credits).toBeDefined();
        expect(credits).toHaveLength(2);
      }
    });

    test("should handle mixed concurrent calls", async () => {
      const container = createMockContainer();
      const promises = [
        multiSearch({ query: "search 1" }, { containerOverride: container }),
        getCreditStatus({ containerOverride: container }),
        multiSearch({ query: "search 2", engines: ["brave"] }, { containerOverride: container }),
        getCreditStatus({ containerOverride: container }),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      expect((results[0] as any).query).toBe("search 1");
      expect(results[1]).toBeDefined();
      expect((results[2] as any).query).toBe("search 2");
      expect(results[3]).toBeDefined();
    });
  });

  describe("Error Recovery and Edge Cases", () => {
    test("should handle partial failure scenarios", async () => {
      const customResponse = {
        query: "partial failure test",
        results: [
          {
            title: "Partial Result",
            url: "https://partial.com",
            snippet: "Partial snippet",
            score: 0.5,
            sourceEngine: "tavily",
          },
        ],
        engineAttempts: [
          { engineId: "tavily", success: true },
          { engineId: "brave", success: false, reason: "API rate limited" },
          { engineId: "linkup", success: false, reason: "Container not healthy" },
        ],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch(
        { query: "partial failure test" },
        { containerOverride: container },
      );

      expect(result.query).toBe("partial failure test");
      expect(result.items).toHaveLength(1);
      expect(result.enginesTried).toHaveLength(3);
      expect(result.enginesTried[0].success).toBe(true);
      expect(result.enginesTried[1].success).toBe(false);
      expect(result.enginesTried[1].reason).toBe("API rate limited");
      expect(result.enginesTried[2].success).toBe(false);
      expect(result.enginesTried[2].reason).toBe("Container not healthy");
    });

    test("should handle large result sets", async () => {
      const customResponse = {
        query: "large dataset test",
        results: Array(10000)
          .fill(null)
          .map((_, i) => ({
            title: `Result ${i}`,
            url: `https://example${i}.com`,
            snippet: "Large snippet ".repeat(10),
            score: 1.0 - i / 10000,
            sourceEngine: "tavily",
          })),
        engineAttempts: [{ engineId: "tavily", success: true }],
        credits: [],
      };
      const container = createMockContainer({ orchestratorResponse: customResponse });
      const result = await multiSearch(
        { query: "large dataset test" },
        { containerOverride: container },
      );

      expect(result.query).toBe("large dataset test");
      expect(result.items).toHaveLength(10000);
    });
  });
});
