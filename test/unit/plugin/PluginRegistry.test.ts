/**
 * Unit tests for PluginRegistry
 * Tests plugin registration, lookup, and provider creation
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngineConfigBase } from "../../../src/config/types";
import type { ProviderMetadata, SearchProvider } from "../../../src/core/provider";
import type { EngineId, SearchQuery, SearchResponse } from "../../../src/core/types";
import { getPluginRegistry, type PluginDefinition, PluginRegistry } from "../../../src/plugin";

// Mock provider for testing
class MockProvider implements SearchProvider {
  readonly id: EngineId;
  private config: EngineConfigBase;

  constructor(config: EngineConfigBase) {
    this.id = config.id;
    this.config = config;
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: this.config.displayName,
    };
  }

  async search(_query: SearchQuery): Promise<SearchResponse> {
    return {
      engineId: this.id,
      items: [],
      tookMs: 0,
    };
  }
}

// Mock plugin config type
interface MockConfig extends EngineConfigBase {
  type: "mock";
  customField?: string;
}

// Create a mock plugin
function createMockPlugin(type: string = "mock"): PluginDefinition<MockConfig, MockProvider> {
  return {
    type,
    displayName: `Mock ${type}`,
    description: `A mock ${type} plugin`,
    version: "1.0.0",
    hasLifecycle: false,
    factory: (config) => new MockProvider(config),
  };
}

describe("PluginRegistry", () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    // Reset singleton for isolated tests
    PluginRegistry.resetInstance();
    registry = PluginRegistry.getInstance();
  });

  afterEach(async () => {
    await registry.clear();
    PluginRegistry.resetInstance();
  });

  describe("singleton pattern", () => {
    test("should return same instance", () => {
      const instance1 = PluginRegistry.getInstance();
      const instance2 = PluginRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });

    test("should return same instance via getPluginRegistry helper", () => {
      const instance1 = getPluginRegistry();
      const instance2 = getPluginRegistry();
      expect(instance1).toBe(instance2);
    });

    test("resetInstance should create new instance", () => {
      const instance1 = PluginRegistry.getInstance();
      PluginRegistry.resetInstance();
      const instance2 = PluginRegistry.getInstance();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe("register", () => {
    test("should register a plugin successfully", async () => {
      const plugin = createMockPlugin("test-plugin");
      const result = await registry.register(plugin);

      expect(result.success).toBe(true);
      expect(result.type).toBe("test-plugin");
      expect(registry.has("test-plugin")).toBe(true);
    });

    test("should fail when registering duplicate plugin without overwrite", async () => {
      const plugin = createMockPlugin("duplicate");
      await registry.register(plugin);

      const result = await registry.register(plugin);
      expect(result.success).toBe(false);
      expect(result.message).toContain("already registered");
    });

    test("should succeed when registering duplicate plugin with overwrite", async () => {
      const plugin1 = createMockPlugin("overwrite-test");
      await registry.register(plugin1);

      const plugin2 = createMockPlugin("overwrite-test");
      const result = await registry.register(plugin2, { overwrite: true });

      expect(result.success).toBe(true);
    });

    test("should call onRegister hook when provided", async () => {
      let hookCalled = false;
      const plugin: PluginDefinition = {
        type: "hook-test",
        displayName: "Hook Test",
        hasLifecycle: false,
        factory: (config) => new MockProvider(config),
        onRegister: () => {
          hookCalled = true;
        },
      };

      await registry.register(plugin);
      expect(hookCalled).toBe(true);
    });

    test("should rollback registration if onRegister fails", async () => {
      const plugin: PluginDefinition = {
        type: "failing-hook",
        displayName: "Failing Hook",
        hasLifecycle: false,
        factory: (config) => new MockProvider(config),
        onRegister: () => {
          throw new Error("Hook failed");
        },
      };

      const result = await registry.register(plugin);
      expect(result.success).toBe(false);
      expect(result.message).toContain("onRegister failed");
      expect(registry.has("failing-hook")).toBe(false);
    });
  });

  describe("registerSync", () => {
    test("should register synchronously", () => {
      const plugin = createMockPlugin("sync-test");
      const result = registry.registerSync(plugin);

      expect(result.success).toBe(true);
      expect(registry.has("sync-test")).toBe(true);
    });

    test("should fail on duplicate without overwrite", () => {
      const plugin = createMockPlugin("sync-dup");
      registry.registerSync(plugin);

      const result = registry.registerSync(plugin);
      expect(result.success).toBe(false);
    });
  });

  describe("unregister", () => {
    test("should unregister an existing plugin", async () => {
      const plugin = createMockPlugin("unregister-test");
      await registry.register(plugin);
      expect(registry.has("unregister-test")).toBe(true);

      const removed = await registry.unregister("unregister-test");
      expect(removed).toBe(true);
      expect(registry.has("unregister-test")).toBe(false);
    });

    test("should return false when unregistering non-existent plugin", async () => {
      const removed = await registry.unregister("non-existent");
      expect(removed).toBe(false);
    });

    test("should call onUnregister hook when provided", async () => {
      let hookCalled = false;
      const plugin: PluginDefinition = {
        type: "unregister-hook-test",
        displayName: "Unregister Hook Test",
        hasLifecycle: false,
        factory: (config) => new MockProvider(config),
        onUnregister: () => {
          hookCalled = true;
        },
      };

      await registry.register(plugin);
      await registry.unregister("unregister-hook-test");
      expect(hookCalled).toBe(true);
    });
  });

  describe("has", () => {
    test("should return true for registered plugins", async () => {
      const plugin = createMockPlugin("has-test");
      await registry.register(plugin);
      expect(registry.has("has-test")).toBe(true);
    });

    test("should return false for unregistered plugins", () => {
      expect(registry.has("not-registered")).toBe(false);
    });
  });

  describe("get", () => {
    test("should return plugin definition", async () => {
      const plugin = createMockPlugin("get-test");
      await registry.register(plugin);

      const retrieved = registry.get("get-test");
      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe("get-test");
      expect(retrieved?.displayName).toBe("Mock get-test");
    });

    test("should return undefined for non-existent plugin", () => {
      expect(registry.get("non-existent")).toBeUndefined();
    });
  });

  describe("getTypes", () => {
    test("should return all registered types", async () => {
      await registry.register(createMockPlugin("type1"));
      await registry.register(createMockPlugin("type2"));
      await registry.register(createMockPlugin("type3"));

      const types = registry.getTypes();
      expect(types).toHaveLength(3);
      expect(types).toContain("type1");
      expect(types).toContain("type2");
      expect(types).toContain("type3");
    });

    test("should return empty array when no plugins registered", () => {
      expect(registry.getTypes()).toHaveLength(0);
    });
  });

  describe("listPlugins", () => {
    test("should return plugin info for all plugins", async () => {
      await registry.register(createMockPlugin("list1"));
      await registry.register(createMockPlugin("list2"));

      const plugins = registry.listPlugins();
      expect(plugins).toHaveLength(2);

      const info1 = plugins.find((p) => p.type === "list1");
      expect(info1).toBeDefined();
      expect(info1?.displayName).toBe("Mock list1");
      expect(info1?.hasLifecycle).toBe(false);
      expect(info1?.isBuiltIn).toBe(false);
    });

    test("should mark built-in plugins correctly", async () => {
      const plugin = createMockPlugin("built-in-test");
      await registry.register(plugin);
      registry.markBuiltIn("built-in-test");

      const plugins = registry.listPlugins();
      const info = plugins.find((p) => p.type === "built-in-test");
      expect(info?.isBuiltIn).toBe(true);
    });
  });

  describe("getPluginInfo", () => {
    test("should return info for specific plugin", async () => {
      const plugin = createMockPlugin("info-test");
      await registry.register(plugin);

      const info = registry.getPluginInfo("info-test");
      expect(info).toBeDefined();
      expect(info?.type).toBe("info-test");
      expect(info?.displayName).toBe("Mock info-test");
    });

    test("should return undefined for non-existent plugin", () => {
      expect(registry.getPluginInfo("non-existent")).toBeUndefined();
    });
  });

  describe("createProvider", () => {
    test("should create provider from registered plugin", async () => {
      const plugin = createMockPlugin("create-test");
      await registry.register(plugin);

      const config: MockConfig = {
        type: "create-test",
        id: "test-instance",
        enabled: true,
        displayName: "Test Instance",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const provider = registry.createProvider(config);
      expect(provider).toBeDefined();
      expect(provider.id).toBe("test-instance");
    });

    test("should throw for unregistered plugin type", () => {
      const config: MockConfig = {
        type: "unregistered" as any,
        id: "test",
        enabled: true,
        displayName: "Test",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      expect(() => registry.createProvider(config)).toThrow("No plugin registered");
    });

    test("should pass container to factory", async () => {
      let receivedContainer: any = null;
      const plugin: PluginDefinition = {
        type: "container-test",
        displayName: "Container Test",
        hasLifecycle: false,
        factory: (config, container) => {
          receivedContainer = container;
          return new MockProvider(config);
        },
      };
      await registry.register(plugin);

      const mockContainer = { test: true };
      registry.createProvider(
        {
          type: "container-test",
          id: "test",
          enabled: true,
          displayName: "Test",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
        { container: mockContainer as any },
      );

      expect(receivedContainer).toBe(mockContainer);
    });
  });

  describe("createProviders", () => {
    test("should create multiple providers", async () => {
      await registry.register(createMockPlugin("multi1"));
      await registry.register(createMockPlugin("multi2"));

      const configs = [
        {
          type: "multi1",
          id: "p1",
          enabled: true,
          displayName: "P1",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
        {
          type: "multi2",
          id: "p2",
          enabled: true,
          displayName: "P2",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
      ];

      const providers = registry.createProviders(configs as any);
      expect(providers).toHaveLength(2);
      expect(providers[0].id).toBe("p1");
      expect(providers[1].id).toBe("p2");
    });
  });

  describe("clear", () => {
    test("should remove all plugins", async () => {
      await registry.register(createMockPlugin("clear1"));
      await registry.register(createMockPlugin("clear2"));
      expect(registry.size).toBe(2);

      await registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.has("clear1")).toBe(false);
      expect(registry.has("clear2")).toBe(false);
    });

    test("should call onUnregister for all plugins", async () => {
      let unregisterCount = 0;
      const createPluginWithHook = (type: string): PluginDefinition => ({
        type,
        displayName: type,
        hasLifecycle: false,
        factory: (config) => new MockProvider(config),
        onUnregister: () => {
          unregisterCount++;
        },
      });

      await registry.register(createPluginWithHook("hook1"));
      await registry.register(createPluginWithHook("hook2"));

      await registry.clear();
      expect(unregisterCount).toBe(2);
    });
  });

  describe("size", () => {
    test("should return correct count", async () => {
      expect(registry.size).toBe(0);

      await registry.register(createMockPlugin("size1"));
      expect(registry.size).toBe(1);

      await registry.register(createMockPlugin("size2"));
      expect(registry.size).toBe(2);

      await registry.unregister("size1");
      expect(registry.size).toBe(1);
    });
  });

  describe("markBuiltIn", () => {
    test("should mark plugin as built-in", async () => {
      await registry.register(createMockPlugin("builtin"));
      registry.markBuiltIn("builtin");

      const info = registry.getPluginInfo("builtin");
      expect(info?.isBuiltIn).toBe(true);
    });

    test("should handle marking non-existent plugin", () => {
      // Should not throw
      registry.markBuiltIn("non-existent");
    });
  });
});
