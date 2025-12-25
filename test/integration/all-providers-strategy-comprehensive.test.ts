/**
 * Unit tests for AllProvidersStrategy
 * Tests 'all' strategy that queries all providers and combines results
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AllProvidersStrategy } from "../../src/core/strategy/AllProvidersStrategy";
import type {
  ISearchStrategy,
  StrategyContext,
  UberSearchOptions,
} from "../../src/core/strategy/ISearchStrategy";
import type {
  EngineId,
  SearchFailureReason,
  SearchQuery,
  SearchResultItem,
} from "../../src/core/types";
import { SearchError } from "../../src/core/types";

// Mock provider for testing
class MockSearchProvider {
  constructor(
    private name: string,
    private results: SearchResultItem[] = [],
    private shouldThrow = false,
    private throwReason?: string,
  ) {}

  async search(params: { query: string; limit?: number; includeRaw?: boolean }) {
    if (this.shouldThrow) {
      throw new SearchError(
        this.name as EngineId,
        (this.throwReason as SearchFailureReason) || "unknown",
        `Provider ${this.name} failed`,
      );
    }

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 1));

    return {
      items: this.results.slice(0, params.limit || this.results.length),
      totalResults: this.results.length,
      query: params.query,
    };
  }
}

// Mock CreditManager for testing
class MockCreditManager {
  private exhaustedEngines = new Set<EngineId>();
  private creditUsage = new Map<EngineId, number>();

  hasSufficientCredits(engineId: EngineId): boolean {
    return !this.exhaustedEngines.has(engineId);
  }

  charge(engineId: EngineId): boolean {
    if (this.exhaustedEngines.has(engineId)) {
      return false;
    }

    const currentUsage = this.creditUsage.get(engineId) || 0;
    this.creditUsage.set(engineId, currentUsage + 1);
    return true;
  }

  // Test helper methods
  exhaustEngine(engineId: EngineId): void {
    this.exhaustedEngines.add(engineId);
  }

  getUsage(engineId: EngineId): number {
    return this.creditUsage.get(engineId) || 0;
  }
}

// Mock provider registry
class MockProviderRegistry {
  private providers = new Map<EngineId, MockSearchProvider>();

  get(engineId: EngineId): MockSearchProvider | undefined {
    return this.providers.get(engineId);
  }

  set(engineId: EngineId, provider: MockSearchProvider): void {
    this.providers.set(engineId, provider);
  }

  has(engineId: EngineId): boolean {
    return this.providers.has(engineId);
  }
}

describe("AllProvidersStrategy", () => {
  let strategy: ISearchStrategy;
  let context: StrategyContext;
  let creditManager: MockCreditManager;
  let providerRegistry: MockProviderRegistry;
  let originalWarn: typeof console.warn;

  const mockResults: Record<string, SearchResultItem[]> = {
    google: [
      {
        title: "Google Result 1",
        url: "https://google1.com",
        snippet: "Google snippet 1",
        score: 0.9,
        sourceEngine: "google",
      },
      {
        title: "Google Result 2",
        url: "https://google2.com",
        snippet: "Google snippet 2",
        score: 0.8,
        sourceEngine: "google",
      },
    ],
    bing: [
      {
        title: "Bing Result 1",
        url: "https://bing1.com",
        snippet: "Bing snippet 1",
        score: 0.85,
        sourceEngine: "bing",
      },
      {
        title: "Bing Result 2",
        url: "https://bing2.com",
        snippet: "Bing snippet 2",
        score: 0.75,
        sourceEngine: "bing",
      },
    ],
    brave: [
      {
        title: "Brave Result 1",
        url: "https://brave1.com",
        snippet: "Brave snippet 1",
        score: 0.95,
        sourceEngine: "brave",
      },
      {
        title: "Brave Result 2",
        url: "https://brave2.com",
        snippet: "Brave snippet 2",
        score: 0.7,
        sourceEngine: "brave",
      },
    ],
  };

  beforeEach(() => {
    strategy = new AllProvidersStrategy();
    creditManager = new MockCreditManager();
    providerRegistry = new MockProviderRegistry();

    context = {
      creditManager: creditManager as unknown as StrategyContext["creditManager"],
      providerRegistry: providerRegistry as unknown as StrategyContext["providerRegistry"],
    };

    // Mock console.warn to avoid test output pollution
    originalWarn = console.warn;
    console.warn = () => {};
  });

  afterEach(() => {
    // Restore console.warn
    console.warn = originalWarn;
  });

  describe("successful execution", () => {
    test("should query all providers and combine results", async () => {
      // Set up providers
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );
      providerRegistry.set(
        "brave" as EngineId,
        new MockSearchProvider("Brave", mockResults.brave || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing", "brave"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(6); // 2 results from each provider
      expect(result.attempts).toHaveLength(3);

      // Check that all attempts were successful
      expect(result.attempts.every((attempt) => attempt.success)).toBe(true);

      // Check that results from all providers are included
      const googleResults = result.results.filter((r) => r.url.includes("google"));
      const bingResults = result.results.filter((r) => r.url.includes("bing"));
      const braveResults = result.results.filter((r) => r.url.includes("brave"));

      expect(googleResults).toHaveLength(2);
      expect(bingResults).toHaveLength(2);
      expect(braveResults).toHaveLength(2);
    });

    test("should respect limit option per provider", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );

      const options: UberSearchOptions = { limit: 1, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("Google Result 1");
    });

    test("should handle empty results from providers", async () => {
      providerRegistry.set("google" as EngineId, new MockSearchProvider("Google", []));
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", []));

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts.every((attempt) => attempt.success)).toBe(true);
    });

    test("should handle single provider", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: true,
      });
    });
  });

  describe("credit management", () => {
    test("should skip providers with insufficient credits", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );
      providerRegistry.set(
        "brave" as EngineId,
        new MockSearchProvider("Brave", mockResults.brave || []),
      );

      // Exhaust bing credits
      creditManager.exhaustEngine("bing" as EngineId);

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing", "brave"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(4); // Google + Brave results only
      expect(result.attempts).toHaveLength(3);

      const bingAttempt = result.attempts.find((a) => a.engineId === "bing");
      expect(bingAttempt?.success).toBe(false);
      expect(bingAttempt?.reason).toBe("out_of_credit");
    });

    test("should charge credits for successful searches", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google", "bing"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(1);
      expect(creditManager.getUsage("bing" as EngineId)).toBe(1);
    });

    test("should not charge credits for failed searches", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "mock_error"),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(0);
    });

    test("should not charge credits for providers with no credits", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );

      // Exhaust google credits
      creditManager.exhaustEngine("google" as EngineId);

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(0);
    });
  });

  describe("error handling", () => {
    test("should handle provider errors gracefully", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Only Bing results
      expect(result.attempts).toHaveLength(2);

      const googleAttempt = result.attempts.find((a) => a.engineId === "google");
      expect(googleAttempt?.success).toBe(false);
      expect(googleAttempt?.reason).toBe("api_error");

      const bingAttempt = result.attempts.find((a) => a.engineId === "bing");
      expect(bingAttempt?.success).toBe(true);
    });

    test("should handle unknown provider errors", async () => {
      providerRegistry.set("google" as EngineId, new MockSearchProvider("Google", [], true));

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[0].reason).toBe("unknown");
    });

    test("should handle missing providers", async () => {
      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["nonexistent"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[0].reason).toBe("no_provider");
    });

    test("should continue after provider failures", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", [], true, "network_error"),
      );
      providerRegistry.set(
        "brave" as EngineId,
        new MockSearchProvider("Brave", mockResults.brave || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing", "brave"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Only Brave results
      expect(result.attempts).toHaveLength(3);

      expect(result.attempts[0].success).toBe(false); // Google
      expect(result.attempts[0].reason).toBe("api_error");

      expect(result.attempts[1].success).toBe(false); // Bing
      expect(result.attempts[1].reason).toBe("network_error");

      expect(result.attempts[2].success).toBe(true); // Brave
    });
  });

  describe("empty and edge cases", () => {
    test("should handle empty engine list", async () => {
      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute("test query", [] as EngineId[], options, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(0);
    });

    test("should handle all providers failing", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", [], true, "network_error"),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts.every((attempt) => !attempt.success)).toBe(true);
    });

    test("should handle all providers with insufficient credits", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );

      creditManager.exhaustEngine("google" as EngineId);
      creditManager.exhaustEngine("bing" as EngineId);

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts.every((attempt) => attempt.reason === "out_of_credit")).toBe(true);
    });
  });

  describe("options handling", () => {
    test("should pass includeRaw option to providers", async () => {
      const googleProvider = new MockSearchProvider("Google", mockResults.google || []);
      const searchCalls: Array<SearchQuery & { includeRaw?: boolean }> = [];
      googleProvider.search = async (params) => {
        searchCalls.push(params);
        return {
          items: mockResults.google || [],
          totalResults: (mockResults.google || []).length,
          query: params.query,
        };
      };
      providerRegistry.set("google" as EngineId, googleProvider);

      const options: UberSearchOptions = { limit: 10, includeRaw: true };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0]).toEqual({
        query: "test query",
        limit: 10,
        includeRaw: true,
      });
    });

    test("should pass query to providers", async () => {
      const googleProvider = new MockSearchProvider("Google", mockResults.google || []);
      const searchCalls: SearchQuery[] = [];
      googleProvider.search = async (params: SearchQuery) => {
        searchCalls.push(params);
        return {
          items: mockResults.google || [],
          totalResults: (mockResults.google || []).length,
          query: params.query,
        };
      };
      providerRegistry.set("google" as EngineId, googleProvider);

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("specific query", ["google"] as EngineId[], options, context);

      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0]).toEqual({
        query: "specific query",
        limit: 10,
        includeRaw: false,
      });
    });
  });

  describe("strategy options", () => {
    test("should accept strategy options in constructor", () => {
      const options = { timeout: 30000, maxConcurrent: 5 };
      const strategyWithOptions = new AllProvidersStrategy(options);

      expect(strategyWithOptions).toBeDefined();
    });

    test("should work with empty options", async () => {
      const strategyWithEmptyOptions = new AllProvidersStrategy({});
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategyWithEmptyOptions.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(true);
    });

    test("should work with undefined options", async () => {
      const strategyWithUndefinedOptions = new AllProvidersStrategy(undefined);
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategyWithUndefinedOptions.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(true);
    });
  });

  describe("performance and ordering", () => {
    test("should maintain result order from different providers", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google || []),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", mockResults.bing || []),
      );

      const options: UberSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      // Results should be in the order providers were called
      expect(result.results[0].title).toBe("Google Result 1");
      expect(result.results[1].title).toBe("Google Result 2");
      expect(result.results[2].title).toBe("Bing Result 1");
      expect(result.results[3].title).toBe("Bing Result 2");
    });

    test("should handle large number of providers", async () => {
      const engineCount = 10;
      const engineIds: EngineId[] = [];

      for (let i = 0; i < engineCount; i++) {
        const engineId = `engine-${i}` as EngineId;
        engineIds.push(engineId);

        const results = [
          {
            title: `Result ${i}-1`,
            url: `https://example${i}.com/1`,
            snippet: `Snippet ${i}-1`,
            score: 0.9,
            sourceEngine: engineId,
          },
          {
            title: `Result ${i}-2`,
            url: `https://example${i}.com/2`,
            snippet: `Snippet ${i}-2`,
            score: 0.8,
            sourceEngine: engineId,
          },
        ];

        providerRegistry.set(engineId, new MockSearchProvider(`Engine ${i}`, results));
      }

      // Set limit to 100 to get all results (10 engines × 2 results = 20)
      const options: UberSearchOptions = { limit: 100, includeRaw: false };
      const result = await strategy.execute("test query", engineIds, options, context);

      expect(result.results).toHaveLength(engineCount * 2); // 2 results per engine
      expect(result.attempts).toHaveLength(engineCount);
      expect(result.attempts.every((attempt) => attempt.success)).toBe(true);
    });
  });
});
