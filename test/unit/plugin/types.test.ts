/**
 * Unit tests for plugin type guards and helpers
 */

import { describe, expect, test } from "bun:test";
import type {
  ILifecycleProvider,
  ProviderMetadata,
  SearchProvider,
} from "../../../src/core/provider";
import type { EngineId, SearchQuery, SearchResponse } from "../../../src/core/types";
import { hasLifecycleManagement, isLifecycleProvider } from "../../../src/plugin/types";

// Mock basic provider (no lifecycle)
class BasicProvider implements SearchProvider {
  readonly id: EngineId = "basic";

  getMetadata(): ProviderMetadata {
    return { id: this.id, displayName: "Basic" };
  }

  async search(_query: SearchQuery): Promise<SearchResponse> {
    return { engineId: this.id, items: [], tookMs: 0 };
  }
}

// Mock lifecycle provider
class LifecycleProvider implements SearchProvider, ILifecycleProvider {
  readonly id: EngineId = "lifecycle";
  private lifecycleManaged = true;

  constructor(managed: boolean = true) {
    this.lifecycleManaged = managed;
  }

  getMetadata(): ProviderMetadata {
    return { id: this.id, displayName: "Lifecycle" };
  }

  async search(_query: SearchQuery): Promise<SearchResponse> {
    return { engineId: this.id, items: [], tookMs: 0 };
  }

  async init(): Promise<void> {}
  async healthcheck(): Promise<boolean> {
    return true;
  }
  async shutdown(): Promise<void> {}
  async validateConfig(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    return { valid: true, errors: [], warnings: [] };
  }
  isLifecycleManaged(): boolean {
    return this.lifecycleManaged;
  }
}

// Mock partial lifecycle provider (missing some methods)
class PartialLifecycleProvider implements SearchProvider {
  readonly id: EngineId = "partial";

  getMetadata(): ProviderMetadata {
    return { id: this.id, displayName: "Partial" };
  }

  async search(_query: SearchQuery): Promise<SearchResponse> {
    return { engineId: this.id, items: [], tookMs: 0 };
  }

  async init(): Promise<void> {}
  // Missing healthcheck and shutdown
}

describe("isLifecycleProvider", () => {
  test("should return false for basic provider", () => {
    const provider = new BasicProvider();
    expect(isLifecycleProvider(provider)).toBe(false);
  });

  test("should return true for lifecycle provider", () => {
    const provider = new LifecycleProvider();
    expect(isLifecycleProvider(provider)).toBe(true);
  });

  test("should return false for partial lifecycle provider", () => {
    const provider = new PartialLifecycleProvider();
    expect(isLifecycleProvider(provider)).toBe(false);
  });

  test("should return false for null", () => {
    expect(isLifecycleProvider(null as any)).toBe(false);
  });

  test("should return false for undefined", () => {
    expect(isLifecycleProvider(undefined as any)).toBe(false);
  });

  test("should return false for plain object", () => {
    expect(isLifecycleProvider({} as any)).toBe(false);
  });

  test("should check for function types", () => {
    const fakeProvider = {
      id: "fake",
      getMetadata: () => ({ id: "fake", displayName: "Fake" }),
      search: async () => ({ engineId: "fake", items: [], tookMs: 0 }),
      init: "not a function",
      healthcheck: "not a function",
      shutdown: "not a function",
    };
    expect(isLifecycleProvider(fakeProvider as any)).toBe(false);
  });
});

describe("hasLifecycleManagement", () => {
  test("should return false for basic provider", () => {
    const provider = new BasicProvider();
    expect(hasLifecycleManagement(provider)).toBe(false);
  });

  test("should return true for lifecycle provider with management enabled", () => {
    const provider = new LifecycleProvider(true);
    expect(hasLifecycleManagement(provider)).toBe(true);
  });

  test("should return false for lifecycle provider with management disabled", () => {
    const provider = new LifecycleProvider(false);
    expect(hasLifecycleManagement(provider)).toBe(false);
  });

  test("should return true for lifecycle provider without isLifecycleManaged method", () => {
    // Create a provider that has lifecycle methods but no isLifecycleManaged
    const provider = {
      id: "no-managed-method",
      getMetadata: () => ({ id: "no-managed-method", displayName: "Test" }),
      search: async () => ({ engineId: "no-managed-method", items: [], tookMs: 0 }),
      init: async () => {},
      healthcheck: async () => true,
      shutdown: async () => {},
      validateConfig: async () => ({ valid: true, errors: [], warnings: [] }),
    };
    expect(hasLifecycleManagement(provider as any)).toBe(true);
  });
});
