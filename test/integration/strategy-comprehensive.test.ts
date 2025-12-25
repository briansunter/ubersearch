/**
 * Comprehensive tests for search strategy implementations
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import type { EngineConfig } from "../../src/config/types";
import type { CreditState, CreditStateProvider } from "../../src/core/credits";
import { CreditManager } from "../../src/core/credits";
import type { ProviderMetadata, SearchProvider } from "../../src/core/provider";
import { ProviderRegistry } from "../../src/core/provider";
import { AllProvidersStrategy } from "../../src/core/strategy/AllProvidersStrategy";
import { FirstSuccessStrategy } from "../../src/core/strategy/FirstSuccessStrategy";
import type {
  ISearchStrategy,
  StrategyContext,
  UberSearchOptions,
} from "../../src/core/strategy/ISearchStrategy";
import type { StrategyOptions } from "../../src/core/strategy/StrategyFactory";
import { StrategyFactory } from "../../src/core/strategy/StrategyFactory";
import { SearchError, type SearchQuery, type SearchResultItem } from "../../src/core/types";

// Mock classes for testing
class MockSearchProvider implements SearchProvider {
  constructor(
    public readonly id: string,
    private shouldFail: boolean = false,
    private delayMs: number = 0,
  ) {}

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: `Mock ${this.id}`,
    };
  }

  async search(
    _query: SearchQuery,
  ): Promise<{ engineId: string; items: SearchResultItem[]; tookMs: number }> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw new SearchError(this.id, "api_error", "Mock API error");
    }

    return {
      engineId: this.id,
      items: [
        {
          title: `Result from ${this.id}`,
          url: `https://example.com/${this.id}`,
          snippet: `Snippet from ${this.id}`,
          score: 0.9,
          sourceEngine: this.id,
        },
      ],
      tookMs: 100,
    };
  }
}

class MockCreditManager extends CreditManager {
  override async initialize(): Promise<void> {
    this.initializeSync();
  }

  initializeSync(): void {
    // Initialize with default state for testing
    const state: CreditState = {};
    // Create initial credit records for all engines
    for (const engine of this.engines.values()) {
      state[engine.id] = {
        used: 0,
        lastReset: new Date().toISOString(),
      };
    }
    // @ts-expect-error - accessing private property for testing
    this.state = state;
  }
}

class MockCreditStateProvider implements CreditStateProvider {
  async loadState(): Promise<CreditState> {
    return {};
  }

  async saveState(_state: CreditState): Promise<void> {
    // Mock implementation - do nothing
  }

  async stateExists(): Promise<boolean> {
    return true;
  }
}

// Test data
const createTestContext = (
  providers: SearchProvider[] = [],
  creditManager?: CreditManager,
): StrategyContext => {
  const registry = new ProviderRegistry();
  providers.forEach((p) => {
    registry.register(p);
  });

  const engines: EngineConfig[] = [
    {
      id: "engine1",
      type: "tavily",
      enabled: true,
      displayName: "Engine 1",
      apiKeyEnv: "TEST_KEY",
      endpoint: "https://test.com",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
      searchDepth: "basic",
    },
    {
      id: "engine2",
      type: "brave",
      enabled: true,
      displayName: "Engine 2",
      apiKeyEnv: "TEST_KEY",
      endpoint: "https://test.com",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
      defaultLimit: 10,
    },
  ];

  const mockCreditManager =
    creditManager || new MockCreditManager(engines, new MockCreditStateProvider());
  // Initialize synchronously for testing
  (mockCreditManager as MockCreditManager).initializeSync();

  return {
    providerRegistry: registry,
    creditManager: mockCreditManager,
  };
};

const _mockResult1: SearchResultItem = {
  title: "Result 1",
  url: "https://example1.com",
  snippet: "Snippet 1",
  score: 0.9,
  sourceEngine: "engine1",
};

const _mockResult2: SearchResultItem = {
  title: "Result 2",
  url: "https://example2.com",
  snippet: "Snippet 2",
  score: 0.8,
  sourceEngine: "engine2",
};

describe("AllProvidersStrategy", () => {
  let strategy: AllProvidersStrategy;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    strategy = new AllProvidersStrategy();
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("constructor", () => {
    test("should create strategy instance with optional options", () => {
      const strategyWithOptions = new AllProvidersStrategy({ timeout: 30000 });
      expect(strategyWithOptions).toBeInstanceOf(AllProvidersStrategy);
    });

    test("should create strategy instance without options", () => {
      expect(strategy).toBeInstanceOf(AllProvidersStrategy);
    });
  });

  describe("execute", () => {
    test("should query all providers and combine results", async () => {
      const provider1 = new MockSearchProvider("engine1");
      const provider2 = new MockSearchProvider("engine2");
      const context = createTestContext([provider1, provider2]);
      const options: UberSearchOptions = { limit: 5 };

      const result = await strategy.execute("test query", ["engine1", "engine2"], options, context);

      expect(result.results).toHaveLength(2);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toEqual({ engineId: "engine1", success: true });
      expect(result.attempts[1]).toEqual({ engineId: "engine2", success: true });
      expect(result.results[0]?.sourceEngine).toBe("engine1");
      expect(result.results[1]?.sourceEngine).toBe("engine2");
    });

    test("should handle provider not found", async () => {
      const context = createTestContext([]);
      const options: UberSearchOptions = {};

      const result = await strategy.execute("test query", ["nonexistent"], options, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toEqual({
        engineId: "nonexistent",
        success: false,
        reason: "no_provider",
      });
    });

    test("should skip providers with insufficient credits", async () => {
      const provider = new MockSearchProvider("engine1");
      const engines: EngineConfig[] = [
        {
          id: "engine1",
          type: "tavily",
          enabled: true,
          displayName: "Engine 1",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          searchDepth: "basic",
        },
      ];
      const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
      creditManager.initializeSync();
      // Pre-exhaust the credits
      creditManager.charge("engine1");
      const context = {
        providerRegistry: new ProviderRegistry(),
        creditManager,
      };
      context.providerRegistry.register(provider);

      const result = await strategy.execute("test query", ["engine1"], {}, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toEqual({
        engineId: "engine1",
        success: false,
        reason: "out_of_credit",
      });
    });

    test("should continue after provider failure", async () => {
      const failingProvider = new MockSearchProvider("engine1", true);
      const successProvider = new MockSearchProvider("engine2");
      const context = createTestContext([failingProvider, successProvider]);

      const result = await strategy.execute("test query", ["engine1", "engine2"], {}, context);

      expect(result.results).toHaveLength(1);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toEqual({
        engineId: "engine1",
        success: false,
        reason: "api_error",
      });
      expect(result.attempts[1]).toEqual({
        engineId: "engine2",
        success: true,
      });
    });

    test("should handle SearchError with custom reason", async () => {
      const provider = new MockSearchProvider("engine1", true);
      const context = createTestContext([provider]);

      const result = await strategy.execute("test query", ["engine1"], {}, context);

      expect(result.attempts[0]).toEqual({
        engineId: "engine1",
        success: false,
        reason: "api_error",
      });
    });

    test("should handle unknown errors gracefully", async () => {
      const mockProvider = {
        id: "engine1",
        getMetadata: () => ({ id: "engine1", displayName: "Engine 1" }),
        search: async () => {
          throw new Error("Unknown error");
        },
      } as SearchProvider;

      const context = createTestContext([mockProvider]);

      const result = await strategy.execute("test query", ["engine1"], {}, context);

      expect(result.attempts[0]).toEqual({
        engineId: "engine1",
        success: false,
        reason: "unknown",
      });
    });

    test("should apply limit to results", async () => {
      const provider = new MockSearchProvider("engine1");
      vi.spyOn(provider, "search").mockImplementation(async (query) => {
        // Mock implementation that respects the limit
        const limit = query.limit || 10;
        const items = [
          { title: "1", url: "1", snippet: "1", sourceEngine: "engine1" },
          { title: "2", url: "2", snippet: "2", sourceEngine: "engine1" },
          { title: "3", url: "3", snippet: "3", sourceEngine: "engine1" },
        ].slice(0, limit);

        return {
          engineId: "engine1",
          items,
          tookMs: 100,
        };
      });

      const context = createTestContext([provider]);
      const options: UberSearchOptions = { limit: 2 };

      const result = await strategy.execute("test query", ["engine1"], options, context);

      expect(result.results).toHaveLength(2);
    });

    test("should pass includeRaw option to provider", async () => {
      const provider = new MockSearchProvider("engine1");
      const searchSpy = vi.spyOn(provider, "search");
      const context = createTestContext([provider]);
      const options: UberSearchOptions = { includeRaw: true };

      await strategy.execute("test query", ["engine1"], options, context);

      expect(searchSpy).toHaveBeenCalledWith({
        query: "test query",
        limit: undefined,
        includeRaw: true,
      });
    });
  });
});

describe("FirstSuccessStrategy", () => {
  let strategy: FirstSuccessStrategy;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    strategy = new FirstSuccessStrategy();
    consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("execute", () => {
    test("should stop after first successful provider", async () => {
      const failingProvider = new MockSearchProvider("engine1", true);
      const successProvider = new MockSearchProvider("engine2");
      const neverCalledProvider = new MockSearchProvider("never-called");
      const context = createTestContext([failingProvider, successProvider, neverCalledProvider]);

      const result = await strategy.execute(
        "test query",
        ["engine1", "engine2", "never-called"],
        {},
        context,
      );

      expect(result.results).toHaveLength(1);
      expect(result.attempts).toHaveLength(2); // Only 2 attempts (failing + success)
      expect(result.attempts[0]).toEqual({
        engineId: "engine1",
        success: false,
        reason: "api_error",
      });
      expect(result.attempts[1]).toEqual({
        engineId: "engine2",
        success: true,
      });
    });

    test("should return results from first successful provider", async () => {
      const provider1 = new MockSearchProvider("engine1");
      const provider2 = new MockSearchProvider("engine2");
      const context = createTestContext([provider1, provider2]);

      const result = await strategy.execute("test query", ["engine1", "engine2"], {}, context);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.sourceEngine).toBe("engine1");
    });

    test("should try all providers if all fail", async () => {
      const failingProvider1 = new MockSearchProvider("failing1", true);
      const failingProvider2 = new MockSearchProvider("failing2", true);
      const context = createTestContext([failingProvider1, failingProvider2]);

      const result = await strategy.execute("test query", ["failing1", "failing2"], {}, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]?.success).toBe(false);
      expect(result.attempts[1]?.success).toBe(false);
    });

    test("should skip providers with insufficient credits", async () => {
      const engines: EngineConfig[] = [
        {
          id: "low-credit",
          type: "tavily",
          enabled: true,
          displayName: "Low Credit",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          searchDepth: "basic",
        },
        {
          id: "success",
          type: "brave",
          enabled: true,
          displayName: "Success",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          defaultLimit: 10,
        },
      ];
      const lowCreditProvider = new MockSearchProvider("low-credit");
      const successProvider = new MockSearchProvider("success");
      const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
      creditManager.initializeSync();
      // Pre-exhaust low credit provider
      creditManager.charge("low-credit");

      const registry = new ProviderRegistry();
      registry.register(lowCreditProvider);
      registry.register(successProvider);

      const context = {
        providerRegistry: registry,
        creditManager,
      };

      const result = await strategy.execute("test query", ["low-credit", "success"], {}, context);

      expect(result.results).toHaveLength(1);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toEqual({
        engineId: "low-credit",
        success: false,
        reason: "out_of_credit",
      });
      expect(result.attempts[1]).toEqual({
        engineId: "success",
        success: true,
      });
    });

    test("should handle provider not found", async () => {
      const successProvider = new MockSearchProvider("engine1");
      const context = createTestContext([successProvider]);

      const result = await strategy.execute("test query", ["nonexistent", "engine1"], {}, context);

      expect(result.results).toHaveLength(1);
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0]).toEqual({
        engineId: "nonexistent",
        success: false,
        reason: "no_provider",
      });
    });

    test("should stop on credit charge failure", async () => {
      const engines: EngineConfig[] = [
        {
          id: "charge-fail",
          type: "tavily",
          enabled: true,
          displayName: "Charge Fail",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          searchDepth: "basic",
        },
      ];
      const provider = new MockSearchProvider("charge-fail");
      const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
      creditManager.initializeSync();
      // Pre-exhaust to cause charge failure
      creditManager.charge("charge-fail");

      const registry = new ProviderRegistry();
      registry.register(provider);

      const context = {
        providerRegistry: registry,
        creditManager,
      };

      const result = await strategy.execute("test query", ["charge-fail"], {}, context);

      expect(result.results).toHaveLength(0);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0]).toEqual({
        engineId: "charge-fail",
        success: false,
        reason: "out_of_credit",
      });
    });

    test("should handle SearchError and unknown errors", async () => {
      const searchErrorProvider = new MockSearchProvider("engine1", true);
      const unknownErrorProvider = {
        id: "engine2",
        getMetadata: () => ({ id: "engine2", displayName: "Engine 2" }),
        search: async () => {
          throw new Error("Unknown error");
        },
      } as SearchProvider;
      const successProvider = new MockSearchProvider("never-called");

      // Create custom context with all required engines
      const engines: EngineConfig[] = [
        {
          id: "engine1",
          type: "tavily",
          enabled: true,
          displayName: "Engine 1",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          searchDepth: "basic",
        },
        {
          id: "engine2",
          type: "brave",
          enabled: true,
          displayName: "Engine 2",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          defaultLimit: 10,
        },
        {
          id: "never-called",
          type: "tavily",
          enabled: true,
          displayName: "Never Called",
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          searchDepth: "basic",
        },
      ];
      const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
      creditManager.initializeSync();
      const registry = new ProviderRegistry();
      registry.register(searchErrorProvider);
      registry.register(unknownErrorProvider);
      registry.register(successProvider);
      const context: StrategyContext = { providerRegistry: registry, creditManager };

      const result = await strategy.execute(
        "test query",
        ["engine1", "engine2", "never-called"],
        {},
        context,
      );

      expect(result.results).toHaveLength(1);
      expect(result.attempts).toHaveLength(3);
      expect(result.attempts[0]?.reason).toBe("api_error");
      expect(result.attempts[1]?.reason).toBe("unknown");
      expect(result.attempts[2]?.success).toBe(true);
    });
  });
});

describe("StrategyFactory", () => {
  // Reset factory state before running StrategyFactory tests to avoid interference from other tests
  beforeEach(() => {
    StrategyFactory.reset();
  });

  describe("createStrategy", () => {
    test("should create AllProvidersStrategy with valid name", () => {
      const strategy = StrategyFactory.createStrategy("all");
      expect(strategy).toBeInstanceOf(AllProvidersStrategy);
    });

    test("should create FirstSuccessStrategy with valid name", () => {
      const strategy = StrategyFactory.createStrategy("first-success");
      expect(strategy).toBeInstanceOf(FirstSuccessStrategy);
    });

    test("should pass options to strategy constructor", () => {
      const options: StrategyOptions = { timeout: 30000, maxConcurrent: 5 };
      const strategy = StrategyFactory.createStrategy("all", options);
      expect(strategy).toBeInstanceOf(AllProvidersStrategy);
    });

    test("should throw error for unknown strategy name", () => {
      StrategyFactory.reset();
      expect(() => {
        StrategyFactory.createStrategy("unknown-strategy");
      }).toThrow(
        'Unknown strategy: "unknown-strategy". Available strategies: [all, first-success]',
      );
    });

    test("should list available strategies in error message", () => {
      try {
        StrategyFactory.createStrategy("invalid");
      } catch (error: unknown) {
        expect(error.message).toContain("all");
        expect(error.message).toContain("first-success");
      }
    });
  });

  describe("registerStrategy", () => {
    test("should register new strategy", () => {
      class CustomStrategy implements ISearchStrategy {
        async execute(
          _query: string,
          _engineIds: string[],
          _options: UberSearchOptions,
          _context: StrategyContext,
        ): Promise<{ results: unknown[]; attempts: unknown[] }> {
          return { results: [], attempts: [] };
        }
      }

      StrategyFactory.registerStrategy("custom", CustomStrategy);
      const strategy = StrategyFactory.createStrategy("custom");
      expect(strategy).toBeInstanceOf(CustomStrategy);
    });

    test("should throw error when registering duplicate strategy", () => {
      class DuplicateStrategy implements ISearchStrategy {
        async execute(
          _query: string,
          _engineIds: string[],
          _options: UberSearchOptions,
          _context: StrategyContext,
        ): Promise<{ results: unknown[]; attempts: unknown[] }> {
          return { results: [], attempts: [] };
        }
      }

      expect(() => {
        StrategyFactory.registerStrategy("all", DuplicateStrategy);
      }).toThrow('Strategy "all" is already registered');
    });
  });

  describe("getAvailableStrategies", () => {
    test("should return list of available strategy names", () => {
      const strategies = StrategyFactory.getAvailableStrategies();
      expect(strategies).toContain("all");
      expect(strategies).toContain("first-success");
      // Note: This test may fail if other tests have registered additional strategies
      // The core strategies are 'all' and 'first-success'
    });

    test("should include registered strategies", () => {
      class TestStrategy implements ISearchStrategy {
        async execute(
          _query: string,
          _engineIds: string[],
          _options: UberSearchOptions,
          _context: StrategyContext,
        ): Promise<{ results: unknown[]; attempts: unknown[] }> {
          return { results: [], attempts: [] };
        }
      }

      StrategyFactory.registerStrategy("test", TestStrategy);
      const strategies = StrategyFactory.getAvailableStrategies();
      expect(strategies).toContain("test");
    });
  });

  describe("hasStrategy", () => {
    test("should return true for existing strategy", () => {
      expect(StrategyFactory.hasStrategy("all")).toBe(true);
      expect(StrategyFactory.hasStrategy("first-success")).toBe(true);
    });

    test("should return false for non-existing strategy", () => {
      expect(StrategyFactory.hasStrategy("nonexistent")).toBe(false);
    });

    test("should return true for registered strategy", () => {
      class TestStrategy implements ISearchStrategy {
        async execute(
          _query: string,
          _engineIds: string[],
          _options: UberSearchOptions,
          _context: StrategyContext,
        ): Promise<any> {
          return { results: [], attempts: [] };
        }
      }

      StrategyFactory.registerStrategy("test-strategy", TestStrategy);
      expect(StrategyFactory.hasStrategy("test-strategy")).toBe(true);
    });
  });
});

// Integration tests
describe("Strategy Integration", () => {
  test("strategies should work with real context objects", async () => {
    const provider = new MockSearchProvider("engine1");
    const engines: EngineConfig[] = [
      {
        id: "engine1",
        type: "tavily",
        enabled: true,
        displayName: "Engine 1",
        apiKeyEnv: "TEST_KEY",
        endpoint: "https://test.com",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        searchDepth: "basic",
      },
    ];
    const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
    creditManager.initializeSync();
    const registry = new ProviderRegistry();
    registry.register(provider);
    const context: StrategyContext = { providerRegistry: registry, creditManager };

    const allStrategy = new AllProvidersStrategy();
    const firstSuccessStrategy = new FirstSuccessStrategy();
    const options: UberSearchOptions = {};

    const allResult = await allStrategy.execute("integration query", ["engine1"], options, context);
    const firstSuccessResult = await firstSuccessStrategy.execute(
      "integration query",
      ["engine1"],
      options,
      context,
    );

    expect(allResult.results).toHaveLength(1);
    expect(firstSuccessResult.results).toHaveLength(1);
    expect(allResult.attempts).toHaveLength(1);
  });

  test("factory-created strategies should work correctly", async () => {
    const provider = new MockSearchProvider("engine1");
    const engines: EngineConfig[] = [
      {
        id: "engine1",
        type: "tavily",
        enabled: true,
        displayName: "Engine 1",
        apiKeyEnv: "TEST_KEY",
        endpoint: "https://test.com",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        searchDepth: "basic",
      },
    ];
    const creditManager = new MockCreditManager(engines, new MockCreditStateProvider());
    creditManager.initializeSync();
    const registry = new ProviderRegistry();
    registry.register(provider);
    const context: StrategyContext = { providerRegistry: registry, creditManager };
    const options: UberSearchOptions = {};

    const allStrategy = StrategyFactory.createStrategy("all");
    const firstSuccessStrategy = StrategyFactory.createStrategy("first-success");

    const allResult = await allStrategy.execute("factory query", ["engine1"], options, context);
    const firstSuccessResult = await firstSuccessStrategy.execute(
      "factory query",
      ["engine1"],
      options,
      context,
    );

    expect(allResult.results).toHaveLength(1);
    expect(firstSuccessResult.results).toHaveLength(1);
  });
});
