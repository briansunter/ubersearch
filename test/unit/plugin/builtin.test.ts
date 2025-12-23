/**
 * Unit tests for built-in plugins
 * Tests registration of built-in providers
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  areBuiltInPluginsRegistered,
  bravePlugin,
  builtInPlugins,
  getBuiltInPluginTypes,
  linkupPlugin,
  PluginRegistry,
  registerBuiltInPlugins,
  searchxngPlugin,
  tavilyPlugin,
} from "../../../src/plugin";

describe("Built-in Plugins", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    PluginRegistry.resetInstance();
    registry = PluginRegistry.getInstance();
  });

  afterEach(async () => {
    await registry.clear();
    PluginRegistry.resetInstance();
  });

  describe("plugin definitions", () => {
    test("tavilyPlugin should have correct properties", () => {
      expect(tavilyPlugin.type).toBe("tavily");
      expect(tavilyPlugin.displayName).toBe("Tavily");
      expect(tavilyPlugin.hasLifecycle).toBe(false);
      expect(typeof tavilyPlugin.factory).toBe("function");
    });

    test("bravePlugin should have correct properties", () => {
      expect(bravePlugin.type).toBe("brave");
      expect(bravePlugin.displayName).toBe("Brave Search");
      expect(bravePlugin.hasLifecycle).toBe(false);
      expect(typeof bravePlugin.factory).toBe("function");
    });

    test("linkupPlugin should have correct properties", () => {
      expect(linkupPlugin.type).toBe("linkup");
      expect(linkupPlugin.displayName).toBe("Linkup");
      expect(linkupPlugin.hasLifecycle).toBe(true);
      expect(typeof linkupPlugin.factory).toBe("function");
    });

    test("searchxngPlugin should have correct properties", () => {
      expect(searchxngPlugin.type).toBe("searchxng");
      expect(searchxngPlugin.displayName).toBe("SearXNG (Local)");
      expect(searchxngPlugin.hasLifecycle).toBe(true);
      expect(typeof searchxngPlugin.factory).toBe("function");
    });
  });

  describe("builtInPlugins array", () => {
    test("should contain all 4 built-in plugins", () => {
      expect(builtInPlugins).toHaveLength(4);
    });

    test("should include tavily", () => {
      expect(builtInPlugins.some((p) => p.type === "tavily")).toBe(true);
    });

    test("should include brave", () => {
      expect(builtInPlugins.some((p) => p.type === "brave")).toBe(true);
    });

    test("should include linkup", () => {
      expect(builtInPlugins.some((p) => p.type === "linkup")).toBe(true);
    });

    test("should include searchxng", () => {
      expect(builtInPlugins.some((p) => p.type === "searchxng")).toBe(true);
    });
  });

  describe("registerBuiltInPlugins", () => {
    test("should register all built-in plugins", async () => {
      await registerBuiltInPlugins(registry);

      expect(registry.has("tavily")).toBe(true);
      expect(registry.has("brave")).toBe(true);
      expect(registry.has("linkup")).toBe(true);
      expect(registry.has("searchxng")).toBe(true);
    });

    test("should mark plugins as built-in", async () => {
      await registerBuiltInPlugins(registry);

      const plugins = registry.listPlugins();
      for (const plugin of plugins) {
        expect(plugin.isBuiltIn).toBe(true);
      }
    });

    test("should use default singleton when no registry provided", async () => {
      await registerBuiltInPlugins();

      const singleton = PluginRegistry.getInstance();
      expect(singleton.has("tavily")).toBe(true);
    });
  });

  describe("areBuiltInPluginsRegistered", () => {
    test("should return false when no plugins registered", () => {
      expect(areBuiltInPluginsRegistered(registry)).toBe(false);
    });

    test("should return false when only some plugins registered", async () => {
      registry.registerSync(tavilyPlugin);
      expect(areBuiltInPluginsRegistered(registry)).toBe(false);
    });

    test("should return true when all plugins registered", async () => {
      await registerBuiltInPlugins(registry);
      expect(areBuiltInPluginsRegistered(registry)).toBe(true);
    });
  });

  describe("getBuiltInPluginTypes", () => {
    test("should return array of built-in types", () => {
      const types = getBuiltInPluginTypes();

      expect(types).toContain("tavily");
      expect(types).toContain("brave");
      expect(types).toContain("linkup");
      expect(types).toContain("searchxng");
      expect(types).toHaveLength(4);
    });
  });

  describe("factory functions", () => {
    test("tavilyPlugin factory should create TavilyProvider", () => {
      const config = {
        type: "tavily" as const,
        id: "test-tavily",
        enabled: true,
        displayName: "Test Tavily",
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "basic" as const,
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const provider = tavilyPlugin.factory(config);
      expect(provider.id).toBe("test-tavily");
      expect(provider.getMetadata().displayName).toBe("Test Tavily");
    });

    test("bravePlugin factory should create BraveProvider", () => {
      const config = {
        type: "brave" as const,
        id: "test-brave",
        enabled: true,
        displayName: "Test Brave",
        apiKeyEnv: "BRAVE_API_KEY",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        defaultLimit: 10,
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const provider = bravePlugin.factory(config);
      expect(provider.id).toBe("test-brave");
      expect(provider.getMetadata().displayName).toBe("Test Brave");
    });

    test("linkupPlugin factory should create LinkupProvider", () => {
      const config = {
        type: "linkup" as const,
        id: "test-linkup",
        enabled: true,
        displayName: "Test Linkup",
        apiKeyEnv: "LINKUP_API_KEY",
        endpoint: "https://api.linkup.ai/search",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const provider = linkupPlugin.factory(config);
      expect(provider.id).toBe("test-linkup");
      expect(provider.getMetadata().displayName).toBe("Test Linkup");
    });

    test("searchxngPlugin factory should create SearchxngProvider", () => {
      const config = {
        type: "searchxng" as const,
        id: "test-searchxng",
        enabled: true,
        displayName: "Test SearXNG",
        apiKeyEnv: "SEARXNG_API_KEY",
        endpoint: "http://localhost:8888/search",
        defaultLimit: 10,
        monthlyQuota: 100000,
        creditCostPerSearch: 0,
        lowCreditThresholdPercent: 0,
      };

      const provider = searchxngPlugin.factory(config);
      expect(provider.id).toBe("test-searchxng");
      expect(provider.getMetadata().displayName).toBe("SearXNG (Local)");
    });
  });
});
