/**
 * Unit Tests for AllProvidersStrategy
 *
 * Tests the core functionality of the AllProvidersStrategy using fake providers
 * and mock dependencies to ensure fast, reliable tests.
 */

import { describe, expect, test } from "bun:test";
import type { SearchProvider } from "../../src/core/provider";
import { AllProvidersStrategy } from "../../src/core/strategy/AllProvidersStrategy";
import type { AiSearchOptions, StrategyContext } from "../../src/core/strategy/ISearchStrategy";
import type { EngineId, SearchQuery, SearchResultItem } from "../../src/core/types";
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

describe("AllProvidersStrategy - Unit Tests", () => {
  test("should create strategy instance", () => {
    const strategy = new AllProvidersStrategy();
    expect(strategy).toBeDefined();
    expect(typeof strategy.execute).toBe("function");
  });

  test("should execute search with multiple providers and combine results", async () => {
    // Arrange
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {};

    // Set up fake providers with different results
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
    expect(result.results).toHaveLength(4);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toEqual({ engineId: "google", success: true });
    expect(result.attempts[1]).toEqual({ engineId: "bing", success: true });

    // Results should be in order from providers (not sorted by score in AllProvidersStrategy)
    expect(result.results[0].title).toBe("Google Result 1");
    expect(result.results[1].title).toBe("Google Result 2");
    expect(result.results[2].title).toBe("Bing Result 1");
    expect(result.results[3].title).toBe("Bing Result 2");
  });

  test("should handle provider errors gracefully", async () => {
    // Arrange
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {};

    // Set up providers - one working, one error
    const provider1 = createFakeProvider("working", [
      {
        title: "Working Result",
        url: "https://working.com/1",
        snippet: "Snip",
        sourceEngine: "working",
        score: 0.9,
      },
    ]);

    const provider2 = new FakeErrorProvider("failing", "Connection failed");

    providers.set("working", provider1);
    providers.set("failing", provider2);
    credits.set("working", 10);
    credits.set("failing", 10);

    // Act
    const result = await strategy.execute("test query", ["working", "failing"], options, context);

    // Assert
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Working Result");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toEqual({ engineId: "working", success: true });
    expect(result.attempts[1]).toEqual({ engineId: "failing", success: false, reason: "unknown" });
  });

  test("should respect result limits", async () => {
    // Arrange
    const strategy = new AllProvidersStrategy();

    // Simple mock implementations
    const credits = new Map();
    const searchCalls: Array<{ engineId: EngineId; params: SearchQuery }> = [];

    const registry: MockProviderRegistry = {
      get: (id) => {
        if (id === "google" || id === "bing") {
          const provider = createFakeProvider(id);
          // Override search method to capture calls
          provider.search = async (params: SearchQuery) => {
            searchCalls.push({ engineId: id, params });
            let results: SearchResultItem[];
            if (id === "google") {
              results = [
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
            } else {
              results = [
                {
                  title: "Bing 1",
                  url: "https://b.com/1",
                  snippet: "S1",
                  sourceEngine: "bing",
                  score: 0.7,
                },
                {
                  title: "Bing 2",
                  url: "https://b.com/2",
                  snippet: "S2",
                  sourceEngine: "bing",
                  score: 0.6,
                },
              ];
            }
            return {
              engineId: id,
              items: results,
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

    const options: AiSearchOptions = {
      limit: 3,
    };

    credits.set("google", 10);
    credits.set("bing", 10);

    // Act
    const result = await strategy.execute("test query", ["google", "bing"], options, context);

    // Assert
    expect(result.results).toHaveLength(3); // Limited to 3 results
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]).toEqual({ engineId: "google", success: true });
    expect(result.attempts[1]).toEqual({ engineId: "bing", success: true });

    // Verify that limit was passed to providers (same limit to all)
    expect(searchCalls).toHaveLength(2);
    expect(searchCalls[0].params.limit).toBe(3);
    expect(searchCalls[1].params.limit).toBe(3); // Same limit passed to all providers
  });

  test("should handle out of credit situations", async () => {
    // Arrange
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {};

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
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {};

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
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {};

    // Act
    const result = await strategy.execute("test query", [], options, context);

    // Assert
    expect(result.results).toHaveLength(0);
    expect(result.attempts).toHaveLength(0);
  });

  test("should pass search options to providers", async () => {
    // Arrange
    const strategy = new AllProvidersStrategy();

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

    const options: AiSearchOptions = {
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
