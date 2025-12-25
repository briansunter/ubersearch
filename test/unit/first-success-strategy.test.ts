/**
 * Unit Tests for FirstSuccessStrategy
 *
 * Tests the core functionality of the FirstSuccessStrategy using fake providers
 * and mock dependencies to ensure fast, reliable tests.
 */

import { describe, expect, test } from "bun:test";
import type { SearchProvider } from "../../src/core/provider";
import { FirstSuccessStrategy } from "../../src/core/strategy/FirstSuccessStrategy";
import type { UberSearchOptions, StrategyContext } from "../../src/core/strategy/ISearchStrategy";
import type { EngineId, SearchQuery } from "../../src/core/types";
import { createFakeProvider, FakeErrorProvider } from "../__helpers__";

// Simplified mock implementations for dependencies
interface MockProviderRegistry {
  get(id: EngineId): SearchProvider | undefined;
}

interface MockCreditManager {
  hasSufficientCredits(engineId: EngineId): boolean;
  charge(engineId: EngineId): boolean;
}

function buildContext(
  registry: MockProviderRegistry,
  creditManager: MockCreditManager,
): StrategyContext {
  return {
    providerRegistry: registry as unknown as StrategyContext["providerRegistry"],
    creditManager: creditManager as unknown as StrategyContext["creditManager"],
  };
}

describe("FirstSuccessStrategy - Unit Tests", () => {
  test("should create strategy instance", () => {
    const strategy = new FirstSuccessStrategy();
    expect(strategy).toBeDefined();
    expect(typeof strategy.execute).toBe("function");
  });

  test("should execute search and return first successful provider results", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Set up fake providers - first one will succeed
    const provider1 = createFakeProvider("google", [
      {
        title: "Google Result 1",
        url: "https://google.com/1",
        snippet: "Snip 1",
        sourceEngine: "google",
        score: 0.9,
      },
      {
        title: "Google Result 2",
        url: "https://google.com/2",
        snippet: "Snip 2",
        sourceEngine: "google",
        score: 0.8,
      },
    ]);

    const provider2 = createFakeProvider("bing", [
      {
        title: "Bing Result 1",
        url: "https://bing.com/1",
        snippet: "Snip 1",
        sourceEngine: "bing",
        score: 0.7,
      },
      {
        title: "Bing Result 2",
        url: "https://bing.com/2",
        snippet: "Snip 2",
        sourceEngine: "bing",
        score: 0.6,
      },
    ]);

    providers.set("google", provider1);
    providers.set("bing", provider2);
    credits.set("google", 10);
    credits.set("bing", 10);

    // Act
    const result = await strategy.execute("test query", ["google", "bing"], options, context);

    // Assert
    // Should only return results from first successful provider (google)
    expect(result.results).toHaveLength(2);
    expect(result.attempts).toHaveLength(1); // Only first attempt recorded
    expect(result.attempts[0]).toEqual({ engineId: "google", success: true });

    expect(result.results[0].title).toBe("Google Result 1");
    expect(result.results[1].title).toBe("Google Result 2");
  });

  test("should try next provider when first fails", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Set up providers - first fails, second succeeds
    const provider1 = new FakeErrorProvider("failing", "Connection failed");
    const provider2 = createFakeProvider("working", [
      {
        title: "Working Result",
        url: "https://working.com/1",
        snippet: "Snip",
        sourceEngine: "working",
        score: 0.9,
      },
    ]);

    providers.set("failing", provider1);
    providers.set("working", provider2);
    credits.set("failing", 10);
    credits.set("working", 10);

    // Act
    const result = await strategy.execute("test query", ["failing", "working"], options, context);

    // Assert
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Working Result");
    expect(result.attempts).toHaveLength(2); // Both attempts recorded
    expect(result.attempts[0]).toEqual({ engineId: "failing", success: false, reason: "unknown" });
    expect(result.attempts[1]).toEqual({ engineId: "working", success: true });
  });

  test("should handle all providers failing", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Set up providers - both fail
    const provider1 = new FakeErrorProvider("failing1", "Connection failed");
    const provider2 = new FakeErrorProvider("failing2", "Timeout");

    providers.set("failing1", provider1);
    providers.set("failing2", provider2);
    credits.set("failing1", 10);
    credits.set("failing2", 10);

    // Act
    const result = await strategy.execute("test query", ["failing1", "failing2"], options, context);

    // Assert
    expect(result.results).toHaveLength(0);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toEqual({ engineId: "failing1", success: false, reason: "unknown" });
    expect(result.attempts[1]).toEqual({ engineId: "failing2", success: false, reason: "unknown" });
  });

  test("should respect result limits", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const credits = new Map();
    const searchCalls: SearchQuery[] = [];

    const registry: MockProviderRegistry = {
      get: (id) => {
        if (id === "google") {
          const provider = createFakeProvider("google");
          // Override search method to respect limit
          provider.search = async (params: SearchQuery) => {
            searchCalls.push(params);
            const allResults = [
              {
                title: "Google 1",
                url: "https://g.com/1",
                snippet: "S1",
                sourceEngine: "google",
                score: 0.9,
              },
              {
                title: "Google 2",
                url: "https://g.com/2",
                snippet: "S2",
                sourceEngine: "google",
                score: 0.8,
              },
            ];
            const limitedResults = params.limit ? allResults.slice(0, params.limit) : allResults;
            return {
              engineId: "google",
              items: limitedResults,
              tookMs: 10,
            };
          };
          return provider;
        }
        return undefined;
      },
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {
      limit: 1,
    };

    credits.set("google", 10);

    // Act
    const result = await strategy.execute("test query", ["google"], options, context);

    // Assert
    expect(result.results).toHaveLength(1); // Limited to 1 result
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toEqual({ engineId: "google", success: true });
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toEqual({
      query: "test query",
      limit: 1,
      includeRaw: undefined,
    });
  });

  test("should handle out of credit situations", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Set up providers but no credits
    const provider1 = createFakeProvider("google", [
      {
        title: "Google Result",
        url: "https://google.com/1",
        snippet: "Snip",
        sourceEngine: "google",
      },
    ]);

    providers.set("google", provider1);
    // No credits set, so should be out of credit

    // Act
    const result = await strategy.execute("test query", ["google"], options, context);

    // Assert
    expect(result.results).toHaveLength(0);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toEqual({
      engineId: "google",
      success: false,
      reason: "out_of_credit",
    });
  });

  test("should handle missing providers", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Don't set up any providers, so they'll be missing

    // Act
    const result = await strategy.execute("test query", ["nonexistent"], options, context);

    // Assert
    expect(result.results).toHaveLength(0);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toEqual({
      engineId: "nonexistent",
      success: false,
      reason: "no_provider",
    });
  });

  test("should handle empty engine list", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const providers = new Map();
    const credits = new Map();

    const registry: MockProviderRegistry = {
      get: (id) => providers.get(id),
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {};

    // Act
    const result = await strategy.execute("test query", [], options, context);

    // Assert
    expect(result.results).toHaveLength(0);
    expect(result.attempts).toHaveLength(0);
  });

  test("should pass search options to providers", async () => {
    // Arrange
    const strategy = new FirstSuccessStrategy();

    // Simple mock implementations
    const credits = new Map();
    const searchCalls: SearchQuery[] = [];

    const registry: MockProviderRegistry = {
      get: (id) => {
        if (id === "google") {
          const provider = createFakeProvider("google");
          // Override search method to capture calls
          provider.search = async (params: SearchQuery) => {
            searchCalls.push(params);
            return {
              engineId: "google",
              items: [
                {
                  title: "Result",
                  url: "https://example.com",
                  snippet: "Snip",
                  sourceEngine: "google",
                },
              ],
              tookMs: 10,
            };
          };
          return provider;
        }
        return undefined;
      },
    };

    const creditManager: MockCreditManager = {
      hasSufficientCredits: (id) => (credits.get(id) || 0) > 0,
      charge: (id) => {
        const current = credits.get(id) || 0;
        if (current > 0) {
          credits.set(id, current - 1);
          return true;
        }
        return false;
      },
    };

    const context = buildContext(registry, creditManager);

    const options: UberSearchOptions = {
      limit: 5,
      includeRaw: true,
    };

    credits.set("google", 10);

    // Act
    await strategy.execute("test query", ["google"], options, context);

    // Assert
    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toEqual({
      query: "test query",
      limit: 5,
      includeRaw: true,
    });
  });
});
