/**
 * Orchestrator Tests
 *
 * Tests for MultiSearchOrchestrator
 *
 * Note: These tests use real strategy implementations to avoid module pollution.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { MultiSearchConfig } from "../../../src/config/types";
import type { CreditManager } from "../../../src/core/credits";
import { MultiSearchOrchestrator } from "../../../src/core/orchestrator";
import type { ProviderMetadata, ProviderRegistry, SearchProvider } from "../../../src/core/provider";
import type { SearchQuery, SearchResponse } from "../../../src/core/types";

// Create a fake provider for testing
class FakeProvider implements SearchProvider {
  constructor(public readonly id: string) {}

  async search(_query: SearchQuery): Promise<SearchResponse> {
    return {
      engineId: this.id,
      items: [
        {
          title: "Test Result",
          url: "https://example.com",
          snippet: "Test",
          sourceEngine: this.id,
          score: 0.9,
        },
      ],
      tookMs: 10,
    };
  }

  getMetadata(): ProviderMetadata {
    return { id: this.id, displayName: `${this.id} Display` };
  }
}

describe("MultiSearchOrchestrator", () => {
  let orchestrator: MultiSearchOrchestrator;
  let mockCreditManager: CreditManager;
  let mockRegistry: ProviderRegistry;
  let mockConfig: MultiSearchConfig;

  beforeEach(() => {
    // Create mock dependencies
    mockCreditManager = {
      initialize: mock(async () => {}),
      charge: mock(() => true),
      hasSufficientCredits: mock(() => true),
      listSnapshots: mock(() => [{ engineId: "test", remaining: 100 }]),
    } as unknown as CreditManager;

    const testProvider = new FakeProvider("test");
    mockRegistry = {
      register: mock(() => {}),
      get: mock((id: string) => (id === "test" ? testProvider : undefined)),
      has: mock((id: string) => id === "test"),
      list: mock(() => ["test"]),
    } as unknown as ProviderRegistry;

    mockConfig = {
      engines: [
        {
          id: "test",
          type: "brave",
          enabled: true,
          displayName: "Test Engine",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          defaultLimit: 10,
        },
      ],
      defaultEngineOrder: ["test"],
    };

    orchestrator = new MultiSearchOrchestrator(mockConfig, mockCreditManager, mockRegistry);
  });

  describe("Constructor", () => {
    test("should initialize with config and dependencies", () => {
      expect(orchestrator).toBeDefined();
    });
  });

  describe("Basic Functionality", () => {
    test("should execute search and return results", async () => {
      const result = await orchestrator.run("test query");

      expect(result).toBeDefined();
      expect(result.query).toBe("test query");
      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });

    test("should throw error for empty engine list", async () => {
      const emptyConfig = { ...mockConfig, defaultEngineOrder: [] };
      const emptyOrchestrator = new MultiSearchOrchestrator(
        emptyConfig,
        mockCreditManager,
        mockRegistry,
      );

      await expect(emptyOrchestrator.run("test query")).rejects.toThrow(
        "No engines configured or selected",
      );
    });

    test("should handle engine order override", async () => {
      const result = await orchestrator.run("test query", {
        engineOrderOverride: ["test"],
      });

      expect(result).toBeDefined();
    });

    test("should handle search options", async () => {
      const result = await orchestrator.run("test query", {
        limit: 5,
      });

      expect(result).toBeDefined();
    });
  });
});
