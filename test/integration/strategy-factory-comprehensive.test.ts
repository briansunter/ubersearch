/**
 * Unit tests for StrategyFactory
 * Tests factory registration and creation of search strategies
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AllProvidersStrategy } from "../../src/core/strategy/AllProvidersStrategy";
import { FirstSuccessStrategy } from "../../src/core/strategy/FirstSuccessStrategy";
import type {
  ISearchStrategy,
  StrategyContext,
  StrategyResult,
} from "../../src/core/strategy/ISearchStrategy";
import { StrategyFactory, type StrategyOptions } from "../../src/core/strategy/StrategyFactory";

// Custom strategy for testing factory registration
class CustomStrategy implements ISearchStrategy {
  async execute(
    _query: string,
    _engineIds: string[],
    _options: unknown,
    _context: unknown,
  ): Promise<StrategyResult> {
    return {
      results: [
        {
          title: "Custom Result",
          url: "https://custom.com",
          snippet: "Custom snippet",
          score: 0.9,
          sourceEngine: "custom",
        },
      ],
      attempts: [{ engineId: "custom", success: true }],
    };
  }
}

// Another custom strategy with different constructor signature
class AlternativeCustomStrategy implements ISearchStrategy {
  constructor(
    private name: string,
    _options?: StrategyOptions,
  ) {}

  async execute(
    _query: string,
    _engineIds: string[],
    _options: unknown,
    _context: unknown,
  ): Promise<StrategyResult> {
    return {
      results: [
        {
          title: `${this.name} Result`,
          url: "https://alternative.com",
          snippet: "Alternative snippet",
          score: 0.8,
          sourceEngine: "alternative",
        },
      ],
      attempts: [{ engineId: "alternative", success: true }],
    };
  }
}

describe("StrategyFactory", () => {
  // Reset StrategyFactory before each test to avoid pollution from previous test runs
  beforeEach(() => {
    StrategyFactory.reset();
  });

  // Reset after each test to ensure clean state for other test files
  afterEach(() => {
    StrategyFactory.reset();
  });

  describe("built-in strategies", () => {
    test("should create AllProvidersStrategy", () => {
      const strategy = StrategyFactory.createStrategy("all");

      expect(strategy).toBeInstanceOf(AllProvidersStrategy);
    });

    test("should create FirstSuccessStrategy", () => {
      const strategy = StrategyFactory.createStrategy("first-success");

      expect(strategy).toBeInstanceOf(FirstSuccessStrategy);
    });

    test("should create strategies with options", () => {
      const options: StrategyOptions = {
        timeout: 30000,
        maxConcurrent: 5,
        retry: {
          attempts: 3,
          delay: 1000,
        },
      };

      const allStrategy = StrategyFactory.createStrategy("all", options);
      const firstSuccessStrategy = StrategyFactory.createStrategy("first-success", options);

      expect(allStrategy).toBeInstanceOf(AllProvidersStrategy);
      expect(firstSuccessStrategy).toBeInstanceOf(FirstSuccessStrategy);
    });

    test("should create strategies with empty options", () => {
      const allStrategy = StrategyFactory.createStrategy("all", {});
      const firstSuccessStrategy = StrategyFactory.createStrategy("first-success", {});

      expect(allStrategy).toBeInstanceOf(AllProvidersStrategy);
      expect(firstSuccessStrategy).toBeInstanceOf(FirstSuccessStrategy);
    });

    test("should create strategies with undefined options", () => {
      const allStrategy = StrategyFactory.createStrategy("all", undefined);
      const firstSuccessStrategy = StrategyFactory.createStrategy("first-success", undefined);

      expect(allStrategy).toBeInstanceOf(AllProvidersStrategy);
      expect(firstSuccessStrategy).toBeInstanceOf(FirstSuccessStrategy);
    });
  });

  describe("error handling", () => {
    test("should throw error for unknown strategy", () => {
      expect(() => StrategyFactory.createStrategy("unknown-strategy")).toThrow(
        'Unknown strategy: "unknown-strategy". Available strategies: [all, first-success]',
      );
    });

    test("should throw error for empty strategy name", () => {
      expect(() => StrategyFactory.createStrategy("")).toThrow(
        'Unknown strategy: "". Available strategies: [all, first-success]',
      );
    });

    test("should throw error for null strategy name", () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      expect(() => StrategyFactory.createStrategy(null as any)).toThrow(
        'Unknown strategy: "null". Available strategies: [all, first-success]',
      );
    });

    test("should throw error for undefined strategy name", () => {
      // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
      expect(() => StrategyFactory.createStrategy(undefined as any)).toThrow(
        'Unknown strategy: "undefined". Available strategies: [all, first-success]',
      );
    });
  });

  describe("strategy registration", () => {
    beforeEach(() => {
      // Reset factory state before each test to avoid conflicts
      // Note: This is a workaround since we can't easily unregister strategies
    });

    afterEach(() => {
      // Clean up custom strategies after each test
      // Since we can't unregister, we'll use unique names for each test
    });

    test("should register custom strategy", () => {
      StrategyFactory.registerStrategy("custom1", CustomStrategy);

      const strategy = StrategyFactory.createStrategy("custom1");
      expect(strategy).toBeInstanceOf(CustomStrategy);
    });

    test("should register custom strategy with options", () => {
      StrategyFactory.registerStrategy("custom2", CustomStrategy);

      const options: StrategyOptions = { timeout: 15000 };
      const strategy = StrategyFactory.createStrategy("custom2", options);

      expect(strategy).toBeInstanceOf(CustomStrategy);
    });

    test("should throw error when registering duplicate strategy", () => {
      StrategyFactory.registerStrategy("custom3", CustomStrategy);

      expect(() => StrategyFactory.registerStrategy("custom3", CustomStrategy)).toThrow(
        'Strategy "custom3" is already registered',
      );
    });

    test("should throw error when registering built-in strategy", () => {
      expect(() => StrategyFactory.registerStrategy("all", CustomStrategy)).toThrow(
        'Strategy "all" is already registered',
      );
    });

    test("should allow multiple custom strategies", () => {
      StrategyFactory.registerStrategy("custom1", CustomStrategy);
      StrategyFactory.registerStrategy("custom2", CustomStrategy);

      const strategy1 = StrategyFactory.createStrategy("custom1");
      const strategy2 = StrategyFactory.createStrategy("custom2");

      expect(strategy1).toBeInstanceOf(CustomStrategy);
      expect(strategy2).toBeInstanceOf(CustomStrategy);
      expect(strategy1).not.toBe(strategy2); // Different instances
    });
  });

  describe("strategy discovery", () => {
    test("should list available strategies", () => {
      const strategies = StrategyFactory.getAvailableStrategies();

      expect(strategies).toContain("all");
      expect(strategies).toContain("first-success");
      expect(strategies.length).toBeGreaterThanOrEqual(2);
    });

    test("should include custom strategies in available list", () => {
      StrategyFactory.registerStrategy("custom", CustomStrategy);

      const strategies = StrategyFactory.getAvailableStrategies();

      expect(strategies).toContain("custom");
    });

    test("should check if strategy exists", () => {
      expect(StrategyFactory.hasStrategy("all")).toBe(true);
      expect(StrategyFactory.hasStrategy("first-success")).toBe(true);
      expect(StrategyFactory.hasStrategy("unknown")).toBe(false);
    });

    test("should check custom strategy existence", () => {
      StrategyFactory.registerStrategy("custom", CustomStrategy);

      expect(StrategyFactory.hasStrategy("custom")).toBe(true);
      expect(StrategyFactory.hasStrategy("nonexistent")).toBe(false);
    });
  });

  describe("strategy functionality", () => {
    test("created strategies should be functional", async () => {
      const strategy = StrategyFactory.createStrategy("all");

      // Mock context for testing
      const mockContext = {
        creditManager: {
          hasSufficientCredits: () => true,
          charge: () => true,
        },
        providerRegistry: {
          get: (_id: string) => ({
            search: async () => ({
              items: [
                {
                  title: "Test Result",
                  url: "https://test.com",
                  snippet: "Test snippet",
                  score: 0.9,
                },
              ],
              totalResults: 1,
              query: "test",
            }),
          }),
        },
      };

      const result = await strategy.execute(
        "test query",
        ["test-engine"],
        { limit: 10, includeRaw: false },
        mockContext as unknown as StrategyContext,
      );

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.attempts).toBeDefined();
    });

    test("custom strategies should be functional", async () => {
      StrategyFactory.registerStrategy("custom", CustomStrategy);

      const strategy = StrategyFactory.createStrategy("custom");
      const mockContext = {
        creditManager: {
          hasSufficientCredits: () => true,
          charge: () => true,
        },
        providerRegistry: {
          get: () => null,
        },
      };

      const result = await strategy.execute(
        "test query",
        [],
        {},
        mockContext as unknown as StrategyContext,
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe("Custom Result");
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].engineId).toBe("custom");
    });
  });

  describe("edge cases", () => {
    test("should handle strategy names with special characters", () => {
      StrategyFactory.registerStrategy("custom-strategy", CustomStrategy);
      StrategyFactory.registerStrategy("custom_strategy", CustomStrategy);
      StrategyFactory.registerStrategy("custom.strategy", CustomStrategy);

      expect(StrategyFactory.hasStrategy("custom-strategy")).toBe(true);
      expect(StrategyFactory.hasStrategy("custom_strategy")).toBe(true);
      expect(StrategyFactory.hasStrategy("custom.strategy")).toBe(true);

      const strategy1 = StrategyFactory.createStrategy("custom-strategy");
      const strategy2 = StrategyFactory.createStrategy("custom_strategy");
      const strategy3 = StrategyFactory.createStrategy("custom.strategy");

      expect(strategy1).toBeInstanceOf(CustomStrategy);
      expect(strategy2).toBeInstanceOf(CustomStrategy);
      expect(strategy3).toBeInstanceOf(CustomStrategy);
    });

    test("should handle very long strategy names", () => {
      const longName = "a".repeat(1000);
      StrategyFactory.registerStrategy(longName, CustomStrategy);

      expect(StrategyFactory.hasStrategy(longName)).toBe(true);

      const strategy = StrategyFactory.createStrategy(longName);
      expect(strategy).toBeInstanceOf(CustomStrategy);
    });

    test("should handle unicode strategy names", () => {
      StrategyFactory.registerStrategy("策略", CustomStrategy);
      StrategyFactory.registerStrategy("🔍", CustomStrategy);
      StrategyFactory.registerStrategy("محرك", CustomStrategy);

      expect(StrategyFactory.hasStrategy("策略")).toBe(true);
      expect(StrategyFactory.hasStrategy("🔍")).toBe(true);
      expect(StrategyFactory.hasStrategy("محرك")).toBe(true);
    });

    test("should maintain strategy registry across multiple calls", () => {
      StrategyFactory.registerStrategy("persistent", CustomStrategy);

      // Multiple calls should return the same strategy type
      const strategy1 = StrategyFactory.createStrategy("persistent");
      const strategy2 = StrategyFactory.createStrategy("persistent");
      const strategy3 = StrategyFactory.createStrategy("persistent");

      expect(strategy1).toBeInstanceOf(CustomStrategy);
      expect(strategy2).toBeInstanceOf(CustomStrategy);
      expect(strategy3).toBeInstanceOf(CustomStrategy);

      // But they should be different instances
      expect(strategy1).not.toBe(strategy2);
      expect(strategy2).not.toBe(strategy3);
    });
  });

  describe("constructor variations", () => {
    test("should handle strategies with different constructor signatures", () => {
      // This tests that the factory can handle different constructor patterns
      // In a real scenario, you'd register strategies that actually use the parameters
      StrategyFactory.registerStrategy("alternative", AlternativeCustomStrategy);

      const strategy = StrategyFactory.createStrategy("alternative");
      expect(strategy).toBeInstanceOf(AlternativeCustomStrategy);
    });
  });
});
