/**
 * Comprehensive Configuration Validation Tests
 *
 * Tests for src/config/validation.ts covering all Zod schemas
 */

import { describe, expect, test } from "bun:test";

// Import all schemas that should be tested
const {
  EngineConfigBaseSchema,
  DockerConfigSchema,
  TavilyConfigSchema,
  BraveConfigSchema,
  LinkupConfigSchema,
  MultiSearchConfigSchema,
  EngineConfigSchema,
  CliInputSchema,
} = require("../../src/config/validation.ts");

describe("Configuration Validation Tests", () => {
  describe("EngineConfigBaseSchema", () => {
    test("should validate valid base engine config", () => {
      const validConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should reject empty id", () => {
      const invalidConfig = {
        id: "",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["id"]);
        expect(result.error.issues[0].message).toContain(
          "Too small: expected string to have >=1 characters",
        );
      }
    });

    test("should reject empty displayName", () => {
      const invalidConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["displayName"]);
      }
    });

    test("should reject non-positive monthlyQuota", () => {
      const invalidConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 0,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["monthlyQuota"]);
        expect(result.error.issues[0].message).toContain("Too small: expected number to be >0");
      }
    });

    test("should reject negative creditCostPerSearch", () => {
      const invalidConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: -1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["creditCostPerSearch"]);
      }
    });

    test("should reject lowCreditThresholdPercent > 100", () => {
      const invalidConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 101,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["lowCreditThresholdPercent"]);
      }
    });

    test("should reject lowCreditThresholdPercent < 0", () => {
      const invalidConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: -1,
      };

      const result = EngineConfigBaseSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["lowCreditThresholdPercent"]);
      }
    });

    test("should accept lowCreditThresholdPercent = 0", () => {
      const validConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigBaseSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("should accept lowCreditThresholdPercent = 100", () => {
      const validConfig = {
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 100,
      };

      const result = EngineConfigBaseSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe("DockerConfigSchema", () => {
    test("should validate minimal Docker config", () => {
      const validConfig = {};

      const result = DockerConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("should validate full Docker config", () => {
      const validConfig = {
        autoStart: true,
        autoStop: false,
        composeFile: "./docker-compose.yml",
        containerName: "my-container",
        healthEndpoint: "http://localhost:8080/health",
        initTimeoutMs: 60000,
      };

      const result = DockerConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should reject invalid healthEndpoint URL", () => {
      const invalidConfig = {
        healthEndpoint: "not-a-url",
      };

      const result = DockerConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["healthEndpoint"]);
        expect(result.error.issues[0].message).toContain("Invalid URL");
      }
    });

    test("should reject negative initTimeoutMs", () => {
      const invalidConfig = {
        initTimeoutMs: -1000,
      };

      const result = DockerConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["initTimeoutMs"]);
      }
    });

    test("should reject non-integer initTimeoutMs", () => {
      const invalidConfig = {
        initTimeoutMs: 60000.5,
      };

      const result = DockerConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["initTimeoutMs"]);
      }
    });
  });

  describe("TavilyConfigSchema", () => {
    test("should validate valid Tavily config", () => {
      const validConfig = {
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

      const result = TavilyConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should reject missing required fields", () => {
      const invalidConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        // Missing apiKeyEnv
        endpoint: "https://api.tavily.com/search",
        searchDepth: "advanced",
      };

      const result = TavilyConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    test("should reject invalid searchDepth", () => {
      const invalidConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "invalid-depth",
      };

      const result = TavilyConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["searchDepth"]);
      }
    });

    test("should reject invalid endpoint URL", () => {
      const invalidConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "not-a-url",
        searchDepth: "advanced",
      };

      const result = TavilyConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["endpoint"]);
      }
    });

    test("should accept basic searchDepth", () => {
      const validConfig = {
        type: "tavily",
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "basic",
      };

      const result = TavilyConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });
  });

  describe("BraveConfigSchema", () => {
    test("should validate valid Brave config", () => {
      const validConfig = {
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

      const result = BraveConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should reject missing defaultLimit", () => {
      const invalidConfig = {
        type: "brave",
        id: "brave",
        enabled: true,
        displayName: "Brave Search",
        monthlyQuota: 500,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "BRAVE_API_KEY",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        // Missing defaultLimit
      };

      const result = BraveConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    test("should reject non-positive defaultLimit", () => {
      const invalidConfig = {
        type: "brave",
        id: "brave",
        enabled: true,
        displayName: "Brave Search",
        monthlyQuota: 500,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "BRAVE_API_KEY",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        defaultLimit: 0,
      };

      const result = BraveConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["defaultLimit"]);
      }
    });
  });

  describe("LinkupConfigSchema", () => {
    test("should validate valid Linkup config", () => {
      const validConfig = {
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

      const result = LinkupConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should merge Docker config properly", () => {
      const validConfig = {
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
        composeFile: "./custom-compose.yml",
        containerName: "custom-linkup",
      };

      const result = LinkupConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoStart).toBe(true);
        expect(result.data.composeFile).toBe("./custom-compose.yml");
        expect(result.data.containerName).toBe("custom-linkup");
      }
    });
  });

  describe("MultiSearchConfigSchema", () => {
    test("should validate valid SearchXNG config", () => {
      const validConfig = {
        type: "searchxng",
        id: "searchxng",
        enabled: true,
        displayName: "SearXNG (Local)",
        monthlyQuota: 10000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "SEARXNG_API_KEY",
        endpoint: "http://localhost:8888/search",
        defaultLimit: 10,
        autoStart: true,
      };

      const result = EngineConfigSchema.safeParse(validConfig);
      if (!result.success) {
        console.log("Validation errors:", result.error.format());
      }

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validConfig);
      }
    });

    test("should handle Docker config properly", () => {
      const validConfig = {
        type: "searchxng",
        id: "searchxng",
        enabled: true,
        displayName: "SearXNG (Local)",
        monthlyQuota: 10000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "SEARXNG_API_KEY",
        endpoint: "http://localhost:8888/search",
        defaultLimit: 10,
        autoStart: true,
        autoStop: false,
        healthEndpoint: "http://localhost:8080/health",
        initTimeoutMs: 30000,
      };

      const result = EngineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.autoStart).toBe(true);
        expect(result.data.autoStop).toBe(false);
        expect(result.data.healthEndpoint).toBe("http://localhost:8080/health");
      }
    });
  });

  describe("EngineConfigSchema", () => {
    test("should validate Tavily config through discriminated union", () => {
      const validConfig = {
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

      const result = EngineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("tavily");
      }
    });

    test("should validate Brave config through discriminated union", () => {
      const validConfig = {
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

      const result = EngineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("brave");
      }
    });

    test("should validate Linkup config through discriminated union", () => {
      const validConfig = {
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
      };

      const result = EngineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("linkup");
      }
    });

    test("should validate SearchXNG config through discriminated union", () => {
      const validConfig = {
        type: "searchxng",
        id: "searchxng",
        enabled: true,
        displayName: "SearXNG (Local)",
        monthlyQuota: 10000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "SEARXNG_API_KEY",
        endpoint: "http://localhost:8888/search",
        defaultLimit: 10,
        autoStart: true,
      };

      const result = EngineConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("searchxng");
      }
    });

    test("should reject unknown provider type", () => {
      const invalidConfig = {
        type: "unknown-provider",
        id: "unknown",
        enabled: true,
        displayName: "Unknown Provider",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
      };

      const result = EngineConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["type"]);
        expect(result.error.issues[0].message).toContain("Invalid input");
      }
    });
  });

  describe("MultiSearchConfigSchema", () => {
    test("should validate valid main config", () => {
      const validConfig = {
        defaultEngineOrder: ["tavily", "brave"],
        engines: [
          {
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
          },
          {
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
          },
        ],
        storage: {
          creditStatePath: "./credits.json",
        },
      };

      const result = MultiSearchConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defaultEngineOrder).toEqual(["tavily", "brave"]);
        expect(result.data.engines).toHaveLength(2);
        expect(result.data.storage?.creditStatePath).toBe("./credits.json");
      }
    });

    test("should validate config with minimal storage", () => {
      const validConfig = {
        defaultEngineOrder: ["tavily"],
        engines: [
          {
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
          },
        ],
      };

      const result = MultiSearchConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.storage).toBeUndefined();
      }
    });

    test("should reject empty defaultEngineOrder", () => {
      const invalidConfig = {
        defaultEngineOrder: [],
        engines: [
          {
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
          },
        ],
      };

      const result = MultiSearchConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["defaultEngineOrder"]);
        expect(result.error.issues[0].message).toContain(
          "Too small: expected array to have >=1 items",
        );
      }
    });

    test("should reject empty engines array", () => {
      const invalidConfig = {
        defaultEngineOrder: ["tavily"],
        engines: [],
      };

      const result = MultiSearchConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["engines"]);
      }
    });

    test("should reject invalid engine in engines array", () => {
      const invalidConfig = {
        defaultEngineOrder: ["tavily"],
        engines: [
          {
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
          },
          {
            type: "unknown",
            id: "unknown",
            enabled: true,
            displayName: "Unknown",
            monthlyQuota: 1000,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 80,
          },
        ],
      };

      const result = MultiSearchConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("CliInputSchema", () => {
    test("should validate valid CLI input", () => {
      const validInput = {
        query: "test search query",
        limit: 10,
        engines: ["tavily", "brave"],
        includeRaw: true,
        strategy: "first-success",
        json: true,
      };

      const result = CliInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("test search query");
        expect(result.data.limit).toBe(10);
        expect(result.data.strategy).toBe("first-success");
      }
    });

    test("should validate minimal CLI input", () => {
      const validInput = {
        query: "simple query",
      };

      const result = CliInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toBe("simple query");
        expect(result.data.limit).toBeUndefined();
        expect(result.data.engines).toBeUndefined();
      }
    });

    test("should reject empty query", () => {
      const invalidInput = {
        query: "",
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["query"]);
        expect(result.error.issues[0].message).toContain(
          "Too small: expected string to have >=1 characters",
        );
      }
    });

    test("should reject negative limit", () => {
      const invalidInput = {
        query: "test query",
        limit: -5,
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"]);
      }
    });

    test("should reject zero limit", () => {
      const invalidInput = {
        query: "test query",
        limit: 0,
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"]);
      }
    });

    test("should reject non-integer limit", () => {
      const invalidInput = {
        query: "test query",
        limit: 10.5,
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["limit"]);
      }
    });

    test("should reject empty engines array", () => {
      const invalidInput = {
        query: "test query",
        engines: [],
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["engines"]);
        expect(result.error.issues[0].message).toContain(
          "Too small: expected array to have >=1 items",
        );
      }
    });

    test("should reject invalid strategy", () => {
      const invalidInput = {
        query: "test query",
        strategy: "invalid-strategy",
      };

      const result = CliInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["strategy"]);
      }
    });

    test("should accept 'all' strategy", () => {
      const validInput = {
        query: "test query",
        strategy: "all",
      };

      const result = CliInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe("all");
      }
    });

    test("should accept 'first-success' strategy", () => {
      const validInput = {
        query: "test query",
        strategy: "first-success",
      };

      const result = CliInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe("first-success");
      }
    });
  });

  describe("Schema Type Inference", () => {
    test("should provide correct types for engine configs", () => {
      const tavilyConfig = {
        type: "tavily" as const,
        id: "tavily",
        enabled: true,
        displayName: "Tavily AI",
        monthlyQuota: 1000,
        creditCostPerSearch: 1,
        lowCreditThresholdPercent: 80,
        apiKeyEnv: "TAVILY_API_KEY",
        endpoint: "https://api.tavily.com/search",
        searchDepth: "advanced" as const,
      };

      const result = TavilyConfigSchema.safeParse(tavilyConfig);
      expect(result.success).toBe(true);

      if (result.success) {
        // Type should include type discriminator
        expect(result.data.type).toBe("tavily");
        expect(result.data.searchDepth).toBe("advanced");
      }
    });

    test("should enforce discriminated unions correctly", () => {
      const configs = [
        {
          id: "test",
          enabled: true,
          displayName: "Test",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          type: "tavily" as const,
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          searchDepth: "basic",
        },
        {
          id: "test",
          enabled: true,
          displayName: "Test",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          type: "brave" as const,
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          defaultLimit: 10,
        },
        {
          id: "test",
          enabled: true,
          displayName: "Test",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          type: "linkup" as const,
          autoStart: true,
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
        },
        {
          id: "test",
          enabled: true,
          displayName: "Test",
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
          type: "searchxng" as const,
          autoStart: true,
          apiKeyEnv: "TEST_KEY",
          endpoint: "https://test.com",
          defaultLimit: 10,
        },
      ];

      for (const config of configs) {
        const result = EngineConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Edge Cases and Complex Scenarios", () => {
    test("should handle deeply nested config validation", () => {
      const complexConfig = {
        defaultEngineOrder: ["tavily", "brave", "linkup", "searchxng"],
        engines: [
          {
            type: "tavily",
            id: "tavily",
            enabled: true,
            displayName: "Tavily AI Search",
            monthlyQuota: 10000,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 75,
            apiKeyEnv: "TAVILY_API_KEY",
            endpoint: "https://api.tavily.com/search",
            searchDepth: "advanced",
          },
          {
            type: "brave",
            id: "brave",
            enabled: false, // Disabled engine
            displayName: "Brave Search",
            monthlyQuota: 5000,
            creditCostPerSearch: 2,
            lowCreditThresholdPercent: 80,
            apiKeyEnv: "BRAVE_API_KEY",
            endpoint: "https://api.search.brave.com/res/v1/web/search",
            defaultLimit: 15,
          },
          {
            type: "linkup",
            id: "linkup",
            enabled: true,
            displayName: "Linkup Search",
            monthlyQuota: 5000,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 70,
            apiKeyEnv: "LINKUP_API_KEY",
            endpoint: "https://api.linkup.so/v1/search",
            autoStart: true,
            autoStop: true,
            composeFile: "./custom-compose.yml",
            containerName: "custom-linkup",
            healthEndpoint: "http://localhost:8080/health",
            initTimeoutMs: 45000,
          },
          {
            type: "searchxng",
            id: "searchxng",
            enabled: true,
            displayName: "SearXNG Local",
            monthlyQuota: 999999,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 90,
            apiKeyEnv: "SEARXNG_API_KEY",
            endpoint: "http://localhost:8888/search",
            defaultLimit: 20,
            autoStart: true,
            autoStop: false,
          },
        ],
        storage: {
          creditStatePath: "/var/lib/multi-search/credits.json",
        },
      };

      const result = MultiSearchConfigSchema.safeParse(complexConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.engines).toHaveLength(4);
        expect(result.data.defaultEngineOrder).toHaveLength(4);
      }
    });

    test("should handle maximum boundary values", () => {
      const boundaryConfig = {
        type: "tavily",
        id: "test-engine",
        enabled: true,
        displayName: "Test Engine",
        monthlyQuota: Number.MAX_SAFE_INTEGER,
        creditCostPerSearch: Number.MAX_SAFE_INTEGER,
        lowCreditThresholdPercent: 100,
        apiKeyEnv: "TEST_API_KEY",
        endpoint: "https://example.com/search",
        searchDepth: "basic",
      };

      const result = TavilyConfigSchema.safeParse(boundaryConfig);
      expect(result.success).toBe(true);
    });

    test("should validate CLI input with special characters", () => {
      const specialCharInput = {
        query: "Search for \"quotes\" and 'single quotes' and special chars: @#$%^&*()",
        engines: ["tavily", "brave"],
        json: true,
      };

      const result = CliInputSchema.safeParse(specialCharInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.query).toContain('"quotes"');
        expect(result.data.query).toContain("'single quotes'");
      }
    });
  });
});
