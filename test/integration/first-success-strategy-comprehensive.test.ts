/**
 * Unit tests for FirstSuccessStrategy
 * Tests 'first-success' strategy that stops after first successful provider
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FirstSuccessStrategy } from "../../src/core/strategy/FirstSuccessStrategy";
import type {
  ISearchStrategy,
  AiSearchOptions,
  StrategyContext,
} from "../../src/core/strategy/ISearchStrategy";
import type { EngineId, SearchFailureReason, SearchResultItem } from "../../src/core/types";
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

describe("FirstSuccessStrategy", () => {
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
    strategy = new FirstSuccessStrategy();
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
    test("should stop after first successful provider", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));
      providerRegistry.set("brave" as EngineId, new MockSearchProvider("Brave", mockResults.brave));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing", "brave"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Only Google results
      expect(result.attempts).toHaveLength(1); // Only Google attempt recorded
      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: true,
      });
    });

    test("should try providers in order until success", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));
      providerRegistry.set("brave" as EngineId, new MockSearchProvider("Brave", mockResults.brave));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing", "brave"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Bing results (first success)
      expect(result.attempts).toHaveLength(2); // Google (fail) + Bing (success)

      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: false,
        reason: "api_error",
      });

      expect(result.attempts[1]).toEqual({
        engineId: "bing",
        success: true,
      });
    });

    test("should respect limit option", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      const options: AiSearchOptions = { limit: 1, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("Google Result 1");
    });

    test("should handle empty results from first provider", async () => {
      providerRegistry.set("google" as EngineId, new MockSearchProvider("Google", []));
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0); // Google has empty results, so it stops there
      expect(result.attempts).toHaveLength(1); // Only Google attempt
      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: true,
      });
    });

    test("should handle single successful provider", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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
        new MockSearchProvider("Google", mockResults.google),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      // Exhaust google credits
      creditManager.exhaustEngine("google" as EngineId);

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Bing results (google skipped)
      expect(result.attempts).toHaveLength(2); // Google (out of credit) + Bing (success)

      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: false,
        reason: "out_of_credit",
      });

      expect(result.attempts[1]).toEqual({
        engineId: "bing",
        success: true,
      });
    });

    test("should charge credits for successful searches", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(1);
    });

    test("should not charge credits for failed searches", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "mock_error"),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(0);
    });

    test("should not charge credits for providers with no credits", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      // Exhaust google credits
      creditManager.exhaustEngine("google" as EngineId);

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(creditManager.getUsage("google" as EngineId)).toBe(0);
    });

    test("should not charge credits for providers that are skipped", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      await strategy.execute("test query", ["google", "bing"] as EngineId[], options, context);

      // Only google should be charged (first success stops execution)
      expect(creditManager.getUsage("google" as EngineId)).toBe(1);
      expect(creditManager.getUsage("bing" as EngineId)).toBe(0);
    });
  });

  describe("error handling", () => {
    test("should handle provider errors and continue", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(2); // Bing results (second provider)
      expect(result.attempts).toHaveLength(2); // Google (fail) + Bing (success)

      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: false,
        reason: "api_error",
      });

      expect(result.attempts[1]).toEqual({
        engineId: "bing",
        success: true,
      });
    });

    test("should handle unknown provider errors", async () => {
      providerRegistry.set("google" as EngineId, new MockSearchProvider("Google", [], true));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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
      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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

    test("should handle all providers failing", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", [], true, "api_error"),
      );
      providerRegistry.set(
        "bing" as EngineId,
        new MockSearchProvider("Bing", [], true, "network_error"),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts.every((attempt) => !attempt.success)).toBe(true);

      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: false,
        reason: "api_error",
      });

      expect(result.attempts[1]).toEqual({
        engineId: "bing",
        success: false,
        reason: "network_error",
      });
    });

    test("should handle all providers with insufficient credits", async () => {
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      creditManager.exhaustEngine("google" as EngineId);
      creditManager.exhaustEngine("bing" as EngineId);

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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

  describe("empty and edge cases", () => {
    test("should handle empty engine list", async () => {
      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute("test query", [] as EngineId[], options, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(0);
    });

    test("should handle providers with empty results", async () => {
      providerRegistry.set("google" as EngineId, new MockSearchProvider("Google", []));
      providerRegistry.set("bing" as EngineId, new MockSearchProvider("Bing", mockResults.bing));

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute(
        "test query",
        ["google", "bing"] as EngineId[],
        options,
        context,
      );

      expect(result.results).toHaveLength(0); // Google has empty results, so it stops there
      expect(result.attempts).toHaveLength(1); // Only Google attempt
      expect(result.attempts[0]).toEqual({
        engineId: "google",
        success: true,
      });
    });
  });

  describe("options handling", () => {
    test("should pass includeRaw option to providers", async () => {
      const googleProvider = new MockSearchProvider("Google", mockResults.google);
      const searchCalls: any[] = [];
      googleProvider.search = async (params) => {
        searchCalls.push(params);
        return {
          items: mockResults.google,
          totalResults: mockResults.google.length,
          query: params.query,
        };
      };
      providerRegistry.set("google" as EngineId, googleProvider);

      const options: AiSearchOptions = { limit: 10, includeRaw: true };
      await strategy.execute("test query", ["google"] as EngineId[], options, context);

      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0]).toEqual({
        query: "test query",
        limit: 10,
        includeRaw: true,
      });
    });

    test("should pass query to providers", async () => {
      const googleProvider = new MockSearchProvider("Google", mockResults.google);
      const searchCalls: any[] = [];
      googleProvider.search = async (params) => {
        searchCalls.push(params);
        return {
          items: mockResults.google,
          totalResults: mockResults.google.length,
          query: params.query,
        };
      };
      providerRegistry.set("google" as EngineId, googleProvider);

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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
      const strategyWithOptions = new FirstSuccessStrategy(options);

      expect(strategyWithOptions).toBeDefined();
    });

    test("should work with empty options", async () => {
      const strategyWithEmptyOptions = new FirstSuccessStrategy({});
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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
      const strategyWithUndefinedOptions = new FirstSuccessStrategy(undefined);
      providerRegistry.set(
        "google" as EngineId,
        new MockSearchProvider("Google", mockResults.google),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
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

  describe("performance characteristics", () => {
    test("should be faster than querying all providers", async () => {
      // Set up providers with delays
      const slowProvider = new MockSearchProvider("Slow", mockResults.google);
      slowProvider.search = async (params) => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
        return {
          items: mockResults.google,
          totalResults: mockResults.google.length,
          query: params.query,
        };
      };

      const fastProvider = new MockSearchProvider("Fast", mockResults.bing);
      fastProvider.search = async (params) => {
        await new Promise((resolve) => setTimeout(resolve, 10)); // 10ms delay
        return {
          items: mockResults.bing,
          totalResults: mockResults.bing.length,
          query: params.query,
        };
      };

      providerRegistry.set("slow" as EngineId, slowProvider);
      providerRegistry.set("fast" as EngineId, fastProvider);

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const startTime = Date.now();
      const result = await strategy.execute(
        "test query",
        ["slow", "fast"] as EngineId[],
        options,
        context,
      );
      const endTime = Date.now();

      // Should get slow provider results and not try fast provider
      expect(result.results).toHaveLength(2);
      expect(result.results[0].title).toBe("Google Result 1"); // From slow provider
      expect(result.attempts).toHaveLength(1); // Only slow provider attempted
      expect(result.attempts[0].engineId).toBe("slow");

      // Should take around 50ms (slow provider time)
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(45); // Allow some variance
      expect(duration).toBeLessThan(70);
    });

    test("should handle large number of providers efficiently", async () => {
      const engineCount = 20;

      // Create providers where only the last one succeeds
      for (let i = 0; i < engineCount - 1; i++) {
        const engineId = `failing-${i}` as EngineId;
        providerRegistry.set(
          engineId,
          new MockSearchProvider(`Failing ${i}`, [], true, "api_error"),
        );
      }

      // Last provider succeeds
      const lastEngineId = `success-${engineCount - 1}` as EngineId;
      providerRegistry.set(
        lastEngineId,
        new MockSearchProvider(`Success ${engineCount - 1}`, mockResults.google),
      );

      const engineIds: EngineId[] = Array.from({ length: engineCount }, (_, i) =>
        i === engineCount - 1 ? (`success-${i}` as EngineId) : (`failing-${i}` as EngineId),
      );

      const options: AiSearchOptions = { limit: 10, includeRaw: false };
      const result = await strategy.execute("test query", engineIds, options, context);

      expect(result.results).toHaveLength(2); // Results from last provider
      expect(result.attempts).toHaveLength(engineCount); // All providers attempted

      // Last attempt should be successful
      expect(result.attempts[engineCount - 1].success).toBe(true);
      expect(result.attempts[engineCount - 1].engineId).toBe(lastEngineId);
    });
  });
});
