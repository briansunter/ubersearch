/**
 * Integration Tests for TavilyProvider
 *
 * Tests the TavilyProvider with actual API calls
 * These tests require a valid TAVILY_API_KEY environment variable
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { TavilyConfig } from "../../../src/config/types";
import { TavilyProvider } from "../../../src/providers/tavily";

// Skip these tests if no API key is available
const hasApiKey = !!process.env.TAVILY_API_KEY;
const skipIntegrationTests =
  process.env.CI === "true" || process.env.SKIP_INTEGRATION_TESTS === "true" || !hasApiKey;

if (!skipIntegrationTests) {
  describe("TavilyProvider - Integration Tests", () => {
    let provider: TavilyProvider;
    let mockConfig: TavilyConfig;

    beforeEach(() => {
      mockConfig = {
        id: "tavily",
        type: "tavily",
        enabled: true,
        displayName: "Tavily Search",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 10,
        apiKeyEnv: "TAVILY_API_KEY",
        searchDepth: "basic",
        endpoint: "https://api.tavily.com/search",
      };
      provider = new TavilyProvider(mockConfig);
    });

    test("should initialize provider", () => {
      expect(provider.id).toBe("tavily");
    });

    test("should return correct metadata", () => {
      const metadata = provider.getMetadata();
      expect(metadata.id).toBe("tavily");
      expect(metadata.displayName).toBe("Tavily Search");
      expect(metadata.docsUrl).toBe("https://docs.tavily.com/");
    });

    // Note: Actual integration tests that require a valid API key would go here
    // For now, we'll just test that the provider initializes correctly
  });
} else {
  describe.skip("TavilyProvider - Integration Tests (Skipped)", () => {
    test("skipped due to missing API key or CI/SKIP_INTEGRATION_TESTS flag", () => {
      expect(true).toBe(true);
    });
  });
}
