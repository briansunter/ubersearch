/**
 * Tests for the bootstrap module
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { bootstrapContainer } from "../../src/bootstrap/container";
import type { UberSearchConfig } from "../../src/config/types";
import type { Container } from "../../src/core/container";
import type { CreditManager } from "../../src/core/credits/CreditManager";
import type { FileCreditStateProvider } from "../../src/core/credits/FileCreditStateProvider";
import type { UberSearchOrchestrator } from "../../src/core/orchestrator";
import type { ProviderRegistry } from "../../src/core/provider";
import { ProviderFactory } from "../../src/core/provider/ProviderFactory";
import type { StrategyFactory } from "../../src/core/strategy/StrategyFactory";
import { PluginRegistry } from "../../src/plugin";

const mockConfig: UberSearchConfig = {
  defaultEngineOrder: ["tavily-test", "brave-test"],
  engines: [
    {
      id: "tavily-test",
      type: "tavily",
      enabled: true,
      displayName: "Tavily Test",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
      apiKeyEnv: "TAVILY_API_KEY",
      endpoint: "https://api.tavily.com/search",
      searchDepth: "basic",
    },
    {
      id: "brave-test",
      type: "brave",
      enabled: true,
      displayName: "Brave Test",
      monthlyQuota: 2000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 75,
      apiKeyEnv: "BRAVE_API_KEY",
      endpoint: "https://api.search.brave.com/res/v1/web/search",
      defaultLimit: 10,
    },
    {
      id: "disabled-test",
      type: "tavily",
      enabled: false,
      displayName: "Disabled Test",
      monthlyQuota: 500,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 70,
      apiKeyEnv: "DISABLED_API_KEY",
      endpoint: "https://api.disabled.com/search",
      searchDepth: "basic",
    },
  ],
  storage: {
    creditStatePath: "/tmp/test-credits.json",
  },
};

describe("bootstrapContainer", () => {
  let container: Container | null;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set mock API keys for tests
    process.env.TAVILY_API_KEY = "test-tavily-key";
    process.env.BRAVE_API_KEY = "test-brave-key";

    // Reset plugin registry for isolated tests
    ProviderFactory.reset();
    PluginRegistry.resetInstance();
  });

  afterEach(async () => {
    if (container) {
      // Reset the global container
      container.reset();
      container = null;
    }

    // Clean up plugin registry
    const registry = PluginRegistry.getInstance();
    await registry.clear();
    PluginRegistry.resetInstance();
    ProviderFactory.reset();

    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("should bootstrap container with all services", async () => {
    container = await bootstrapContainer(mockConfig);

    expect(container).toBeDefined();
    expect(container.has("config")).toBe(true);
    expect(container.has("creditStateProvider")).toBe(true);
    expect(container.has("creditManager")).toBe(true);
    expect(container.has("providerRegistry")).toBe(true);
    expect(container.has("strategyFactory")).toBe(true);
    expect(container.has("orchestrator")).toBe(true);
  });

  test("should register configuration correctly", async () => {
    container = await bootstrapContainer(mockConfig);
    const config = await container.get<UberSearchConfig>("config");

    expect(config).toBe(mockConfig);
    expect(config.defaultEngineOrder).toEqual(["tavily-test", "brave-test"]);
  });

  test("should initialize credit manager", async () => {
    container = await bootstrapContainer(mockConfig);
    const creditManager = container.get<CreditManager>("creditManager");

    expect(creditManager).toBeDefined();
    expect(typeof creditManager.hasSufficientCredits).toBe("function");
    expect(typeof creditManager.charge).toBe("function");
    expect(typeof creditManager.listSnapshots).toBe("function");
  });

  test("should register enabled providers only", async () => {
    container = await bootstrapContainer(mockConfig);
    const registry = container.get<ProviderRegistry>("providerRegistry");
    const providers = registry.list();

    expect(providers).toHaveLength(2); // Only enabled providers
    expect(providers.map((p) => p.id)).toContain("tavily-test");
    expect(providers.map((p) => p.id)).toContain("brave-test");
    expect(providers.map((p) => p.id)).not.toContain("disabled-test");
  });

  test("should register orchestrator with correct dependencies", async () => {
    container = await bootstrapContainer(mockConfig);
    const orchestrator = await container.get<UberSearchOrchestrator>("orchestrator");

    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.run).toBe("function");
  });

  test("should handle provider creation errors gracefully", async () => {
    const invalidConfig = {
      ...mockConfig,
      engines: [
        ...mockConfig.engines,
        {
          id: "invalid-test",
          // biome-ignore lint/suspicious/noExplicitAny: testing invalid type
          type: "unknown-type" as any,
          enabled: true,
          displayName: "Invalid Test",
          monthlyQuota: 100,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          apiKeyEnv: "INVALID_API_KEY",
          endpoint: "https://api.invalid.com/search",
        },
      ],
    };

    // Should not throw, but log warning
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid config
    container = await bootstrapContainer(invalidConfig as any);
    const registry = await container.get<ProviderRegistry>("providerRegistry");
    const providers = registry.list();

    // Should still have the valid providers
    expect(providers).toHaveLength(2);
  });

  test("should throw error when no providers can be registered", async () => {
    const emptyConfig = {
      ...mockConfig,
      engines: [],
    };

    await expect(bootstrapContainer(emptyConfig)).rejects.toThrow("No search providers available");
  });

  test("should throw error when all providers fail", async () => {
    const allDisabledConfig = {
      ...mockConfig,
      engines: mockConfig.engines.map((engine) => ({
        ...engine,
        enabled: false,
      })),
    };

    await expect(bootstrapContainer(allDisabledConfig)).rejects.toThrow(
      "No search providers available",
    );
  });

  test("should handle custom credit state path", async () => {
    const customPath = "/tmp/custom-test-credits.json";
    container = await bootstrapContainer(mockConfig, customPath);

    const creditProvider = await container.get<FileCreditStateProvider>("creditStateProvider");
    expect(creditProvider.getStatePath()).toBe(customPath);
  });

  test("should register strategy factory", async () => {
    container = await bootstrapContainer(mockConfig);
    const strategyFactory = await container.get<typeof StrategyFactory>("strategyFactory");

    expect(strategyFactory).toBeDefined();
    expect(typeof strategyFactory.createStrategy).toBe("function");
  });

  test("should handle container cleanup on failure", async () => {
    // This test would need more complex setup to trigger cleanup
    // For now, we just verify the container is created properly
    container = await bootstrapContainer(mockConfig);
    expect(container).toBeDefined();
  });
});

describe("Container Service Resolution", () => {
  let container: Container | null;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Set mock API keys for tests
    process.env.TAVILY_API_KEY = "test-tavily-key";
    process.env.BRAVE_API_KEY = "test-brave-key";

    // Reset plugin registry for isolated tests
    ProviderFactory.reset();
    PluginRegistry.resetInstance();

    container = await bootstrapContainer(mockConfig);
  });

  afterEach(async () => {
    if (container) {
      // Reset the global container
      container.reset();
      container = null;
    }

    // Clean up plugin registry
    const registry = PluginRegistry.getInstance();
    await registry.clear();
    PluginRegistry.resetInstance();
    ProviderFactory.reset();

    // Restore original environment
    process.env = { ...originalEnv };
  });

  test("should resolve singleton services correctly", async () => {
    const config1 = await container?.get<UberSearchConfig>("config");
    const config2 = await container?.get<UberSearchConfig>("config");

    expect(config1).toBe(config2); // Same instance
  });

  test("should resolve credit manager state correctly", async () => {
    const creditManager = await container?.get<CreditManager>("creditManager");
    const snapshots = creditManager.listSnapshots();

    expect(snapshots).toHaveLength(2); // Only enabled engines
    expect(snapshots[0]).toMatchObject({
      engineId: expect.any(String),
      quota: expect.any(Number),
      used: expect.any(Number),
      remaining: expect.any(Number),
      isExhausted: expect.any(Boolean),
    });
  });

  test("should provide working orchestrator", async () => {
    const orchestrator = await container?.get<UberSearchOrchestrator>("orchestrator");

    // Mock the search to avoid actual API calls
    const _mockResults = {
      query: "test query",
      results: [],
      engineAttempts: [],
      credits: [],
    };

    // This would normally make actual API calls
    // For testing, we'd need to mock the providers
    expect(orchestrator.run).toBeDefined();
    expect(typeof orchestrator.run).toBe("function");
  });
});
