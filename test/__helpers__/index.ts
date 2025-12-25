/**
 * Consolidated Test Utilities and Helpers
 *
 * Common utilities for creating mocks, fakes, and test data for ubersearch tests.
 */

import type { EngineConfig, UberSearchConfig } from "../../src/config/types";
import type { CreditManager, CreditState, CreditStateProvider } from "../../src/core/credits";
import type { ProviderMetadata, ProviderRegistry, SearchProvider } from "../../src/core/provider";
import type { EngineId, SearchQuery, SearchResponse, SearchResultItem } from "../../src/core/types";

// ============ Result Factories ============

/**
 * Create a single mock search result item
 */
export function createMockResult(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    title: "Test Result",
    url: "https://example.com",
    snippet: "Test snippet",
    sourceEngine: "test" as EngineId,
    score: 0.9,
    ...overrides,
  };
}

/**
 * Create an array of mock search results
 */
export function createMockResults(
  count: number = 2,
  engineId: EngineId = "test" as EngineId,
): SearchResultItem[] {
  return Array.from({ length: count }, (_, i) =>
    createMockResult({
      title: `Test Result ${i + 1}`,
      url: `https://example${i + 1}.com`,
      snippet: `This is test result ${i + 1}`,
      sourceEngine: engineId,
      score: 1 - i * 0.1,
    }),
  );
}

// ============ Provider Factories ============

/**
 * Interface for fake provider options
 */
export interface FakeProviderOptions {
  results?: SearchResultItem[];
  shouldFail?: boolean;
  failureMessage?: string;
  delayMs?: number;
}

/**
 * Fake Search Provider for Unit Testing
 * A simple, predictable implementation for testing without external dependencies
 */
export class FakeSearchProvider implements SearchProvider {
  constructor(
    public readonly id: string,
    private options: FakeProviderOptions = {},
  ) {}

  async search(query: SearchQuery): Promise<SearchResponse> {
    // Simulate network delay
    if (this.options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
    }

    if (this.options.shouldFail) {
      throw new Error(this.options.failureMessage || "Provider error");
    }

    const limit = query.limit || 10;
    const items = (this.options.results || createMockResults(2, this.id as EngineId)).slice(
      0,
      limit,
    );

    return {
      engineId: this.id,
      items,
      tookMs: this.options.delayMs || 10,
    };
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: `${this.id.charAt(0).toUpperCase() + this.id.slice(1)} Search`,
    };
  }
}

/**
 * Fake provider that always throws an error
 */
export class FakeErrorProvider implements SearchProvider {
  constructor(
    public readonly id: string,
    private errorMessage: string = "Provider error",
  ) {}

  async search(_query: SearchQuery): Promise<SearchResponse> {
    throw new Error(this.errorMessage);
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      displayName: `${this.id} (Error Provider)`,
    };
  }
}

/**
 * Create a fake provider with optional custom results or error behavior
 * @param id - The engine ID
 * @param optionsOrResults - Either a FakeProviderOptions object or an array of SearchResultItem
 */
export function createFakeProvider(
  id: string,
  optionsOrResults: FakeProviderOptions | SearchResultItem[] = {},
): FakeSearchProvider {
  // Handle array shorthand: createFakeProvider("google", [...results])
  if (Array.isArray(optionsOrResults)) {
    return new FakeSearchProvider(id, { results: optionsOrResults });
  }
  return new FakeSearchProvider(id, optionsOrResults);
}

// ============ Config Factories ============

/**
 * Create a minimal test engine configuration
 */
export function createTestEngineConfig(
  id: string,
  type: "tavily" | "brave" | "searchxng" | "linkup" = "tavily",
  overrides: Partial<EngineConfig> = {},
): EngineConfig {
  const base = {
    id,
    type,
    enabled: true,
    displayName: `${id} Test`,
    monthlyQuota: 1000,
    creditCostPerSearch: 1,
    lowCreditThresholdPercent: 80,
    apiKeyEnv: `${id.toUpperCase()}_API_KEY`,
    endpoint: `https://api.${id}.com/search`,
  };

  if (type === "tavily") {
    return { ...base, searchDepth: "basic", ...overrides } as EngineConfig;
  } else if (type === "brave") {
    return { ...base, defaultLimit: 10, ...overrides } as EngineConfig;
  } else {
    return { ...base, ...overrides } as EngineConfig;
  }
}

/**
 * Create a minimal test configuration
 */
export function createTestConfig(overrides: Partial<UberSearchConfig> = {}): UberSearchConfig {
  return {
    engines: [],
    defaultEngineOrder: [],
    storage: {
      creditStatePath: "/tmp/test-credits.json",
    },
    ...overrides,
  };
}

// ============ Mock Credit System ============

/**
 * Mock credit state provider for testing
 */
export class MockCreditStateProvider implements CreditStateProvider {
  private state: CreditState = {};
  private throwOnLoad = false;
  private throwOnSave = false;

  async loadState(): Promise<CreditState> {
    if (this.throwOnLoad) {
      throw new Error("Failed to load state");
    }
    return this.state;
  }

  async saveState(state: CreditState): Promise<void> {
    if (this.throwOnSave) {
      throw new Error("Failed to save state");
    }
    this.state = state;
  }

  async stateExists(): Promise<boolean> {
    return Object.keys(this.state).length > 0;
  }

  // Test helpers
  setThrowOnLoad(shouldThrow: boolean): void {
    this.throwOnLoad = shouldThrow;
  }

  setThrowOnSave(shouldThrow: boolean): void {
    this.throwOnSave = shouldThrow;
  }

  setState(state: CreditState): void {
    this.state = state;
  }

  getState(): CreditState {
    return this.state;
  }
}

// ============ Utility Functions ============

/**
 * Wait for a specified amount of time
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock fetch function that returns specified responses
 */
export function createMockFetch(responses: Map<string, { status: number; body: unknown }>) {
  return async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const urlString = typeof url === "string" ? url : url.toString();

    for (const [pattern, response] of responses.entries()) {
      if (urlString.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };
}

// ============ Type Exports ============

export type {
  SearchProvider,
  ProviderMetadata,
  SearchQuery,
  SearchResponse,
  SearchResultItem,
  EngineId,
  UberSearchConfig,
  EngineConfig,
  CreditManager,
  CreditStateProvider,
  CreditState,
  ProviderRegistry,
};
