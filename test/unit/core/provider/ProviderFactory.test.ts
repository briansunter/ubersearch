/**
 * ProviderFactory Tests
 *
 * Tests for src/core/provider/ProviderFactory.ts
 * Uses real provider classes instead of mocks for simpler, more reliable tests.
 * Updated to work with plugin-based factory.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngineConfig } from "../../../src/config/types";
import { container } from "../../../src/core/container";
import { ProviderFactory } from "../../../src/core/provider/ProviderFactory";
import { PluginRegistry } from "../../../src/plugin";

describe("ProviderFactory", () => {
  beforeEach(() => {
    // Reset state for isolated tests
    ProviderFactory.reset();
    PluginRegistry.resetInstance();
  });

  afterEach(async () => {
    ProviderFactory.reset();
    const registry = PluginRegistry.getInstance();
    await registry.clear();
    PluginRegistry.resetInstance();
  });

  describe("createProvider", () => {
    test("should create TavilyProvider instance", () => {
      const tavilyConfig: EngineConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "advanced",
      };

      const provider = ProviderFactory.createProvider(tavilyConfig, container);

      expect(provider).toBeDefined();
      expect(provider.id).toBe("tavily");
      expect(provider.getMetadata).toBeDefined();
      expect(provider.getMetadata().id).toBe("tavily");
    });

    test("should create BraveProvider instance", () => {
      const braveConfig: EngineConfig = {
        type: "brave",
        id: "brave",
        enabled: true,
        displayName: "Brave Search",
        monthlyQuota: 500,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "BRAVE_API_KEY",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        defaultLimit: 10,
      };

      const provider = ProviderFactory.createProvider(braveConfig, container);

      expect(provider).toBeDefined();
      expect(provider.id).toBe("brave");
      expect(provider.getMetadata).toBeDefined();
      expect(provider.getMetadata().id).toBe("brave");
    });

    test("should create LinkupProvider instance", () => {
      const linkupConfig: EngineConfig = {
        type: "linkup",
        id: "linkup",
        enabled: true,
        displayName: "Linkup Search",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "LINKUP_API_KEY",
        endpoint: "https://api.linkup.so/v1/search",
        autoStart: true,
        autoStop: true,
      };

      const provider = ProviderFactory.createProvider(linkupConfig, container);

      expect(provider).toBeDefined();
      expect(provider.id).toBe("linkup");
      expect(provider.getMetadata).toBeDefined();
      expect(provider.getMetadata().id).toBe("linkup");
    });

    test("should create SearchxngProvider instance", () => {
      const searchxngConfig: EngineConfig = {
        type: "searchxng",
        id: "searchxng",
        enabled: true,
        displayName: "SearXNG (Local)",
        monthlyQuota: 10000,
        creditCostPerSearch: 0,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "SEARXNG_API_KEY",
        endpoint: "http://localhost:8888/search",
        defaultLimit: 10,
        autoStart: true,
      };

      const provider = ProviderFactory.createProvider(searchxngConfig, container);

      expect(provider).toBeDefined();
      expect(provider.id).toBe("searchxng");
      expect(provider.getMetadata).toBeDefined();
      expect(provider.getMetadata().id).toBe("searchxng");
    });

    test("should throw error for unknown provider type", () => {
      const unknownConfig = {
        type: "unknown-provider",
        id: "unknown",
        enabled: true,
        displayName: "Unknown Provider",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      } as unknown as EngineConfig;

      expect(() => {
        ProviderFactory.createProvider(unknownConfig, container);
      }).toThrow("No plugin registered for type 'unknown-provider'");
    });

    test("should throw error for missing type", () => {
      const invalidConfig = {
        id: "invalid",
        enabled: true,
        displayName: "Invalid",
      } as unknown as EngineConfig;

      expect(() => {
        ProviderFactory.createProvider(invalidConfig, container);
      }).toThrow();
    });
  });

  describe("Factory Pattern", () => {
    test("should create instances of correct provider classes", () => {
      const configs: { type: string; expectedId: string }[] = [
        { type: "tavily", expectedId: "tavily" },
        { type: "brave", expectedId: "brave" },
        { type: "linkup", expectedId: "linkup" },
        { type: "searchxng", expectedId: "searchxng" },
      ];

      configs.forEach(({ type, expectedId }) => {
        const config: EngineConfig = {
          type: type as EngineConfig["type"],
          id: expectedId,
          enabled: true,
          displayName: `${expectedId} Display`,
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          apiKeyEnv: `${expectedId.toUpperCase()}_API_KEY`,
          endpoint: `https://api.${expectedId}.com/search`,
          searchDepth: "advanced",
          defaultLimit: 10,
          autoStart: true,
        };

        const provider = ProviderFactory.createProvider(config, container);
        expect(provider.id).toBe(expectedId);
      });
    });

    test("should create multiple providers without conflicts", () => {
      const tavilyConfig: EngineConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "advanced",
      };

      const providers = Array.from({ length: 5 }, () =>
        ProviderFactory.createProvider(tavilyConfig, container),
      );

      expect(providers).toHaveLength(5);
      providers.forEach((provider) => {
        expect(provider.id).toBe("tavily");
        expect(provider.getMetadata).toBeDefined();
      });
    });
  });

  describe("SearchProvider interface", () => {
    test("should create providers with required interface methods", () => {
      const config: EngineConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "advanced",
      };

      const provider = ProviderFactory.createProvider(config, container);

      // Should implement SearchProvider interface
      expect(provider.id).toBeDefined();
      expect(typeof provider.getMetadata).toBe("function");
      expect(typeof provider.search).toBe("function");

      // Metadata should have required fields
      const metadata = provider.getMetadata();
      expect(metadata.id).toBe("tavily");
      expect(metadata.displayName).toBeDefined();
    });
  });

  describe("Plugin-based factory features", () => {
    test("isTypeSupported should return true for built-in types", () => {
      expect(ProviderFactory.isTypeSupported("tavily")).toBe(true);
      expect(ProviderFactory.isTypeSupported("brave")).toBe(true);
      expect(ProviderFactory.isTypeSupported("linkup")).toBe(true);
      expect(ProviderFactory.isTypeSupported("searchxng")).toBe(true);
    });

    test("isTypeSupported should return false for unknown types", () => {
      expect(ProviderFactory.isTypeSupported("unknown")).toBe(false);
    });

    test("getSupportedTypes should return all built-in types", () => {
      const types = ProviderFactory.getSupportedTypes();
      expect(types).toContain("tavily");
      expect(types).toContain("brave");
      expect(types).toContain("linkup");
      expect(types).toContain("searchxng");
    });

    test("createProviders should create multiple providers", () => {
      const configs: EngineConfig[] = [
        {
          type: "tavily",
          id: "multi-tavily",
          enabled: true,
          displayName: "Multi Tavily",
          apiKeyEnv: "TAVILY_API_KEY",
          endpoint: "https://api.tavily.com/search",
          searchDepth: "basic",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
        {
          type: "brave",
          id: "multi-brave",
          enabled: true,
          displayName: "Multi Brave",
          apiKeyEnv: "BRAVE_API_KEY",
          endpoint: "https://api.search.brave.com/res/v1/web/search",
          defaultLimit: 10,
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
      ];

      const providers = ProviderFactory.createProviders(configs, container);
      expect(providers).toHaveLength(2);
      expect(providers[0].id).toBe("multi-tavily");
      expect(providers[1].id).toBe("multi-brave");
    });
  });
});
