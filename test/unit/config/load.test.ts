import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configExists, getConfigPaths, loadConfig } from "../../../src/config/load";
import type { UberSearchConfig } from "../../../src/config/types";
import { PluginRegistry } from "../../../src/plugin";

describe("Config Loader", () => {
  let testDir: string;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `ubersearch-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Save original state
    originalCwd = process.cwd();
    originalEnv = { ...process.env };

    // Reset plugin registry to avoid state pollution
    PluginRegistry.resetInstance();

    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(async () => {
    // Restore original state
    process.chdir(originalCwd);
    process.env = originalEnv;

    // Clear plugin registry
    const registry = PluginRegistry.getInstance();
    await registry.clear();
    PluginRegistry.resetInstance();

    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe("getConfigPaths", () => {
    it("should return explicit path first if provided", () => {
      const explicitPath = "/custom/path/config.json";
      const paths = getConfigPaths(explicitPath);

      expect(paths[0]).toBe(explicitPath);
      expect(paths.length).toBeGreaterThan(1);
    });

    it("should return local config paths when no explicit path (TS first)", () => {
      const paths = getConfigPaths();

      // First path should be .ts variant (preferred)
      expect(paths[0]).toContain("ubersearch.config.ts");
      expect(paths[0]).toBe(join(process.cwd(), "ubersearch.config.ts"));
      // Second should be .json variant
      expect(paths[1]).toContain("ubersearch.config.json");
    });

    it("should include XDG config paths", () => {
      const paths = getConfigPaths();

      // Should have both TS and JSON variants for XDG
      const xdgTsPath = paths.find((p) => p.includes(".config/ubersearch/config.ts"));
      const xdgJsonPath = paths.find((p) => p.includes(".config/ubersearch/config.json"));
      expect(xdgTsPath).toBeDefined();
      expect(xdgJsonPath).toBeDefined();
    });

    it("should respect XDG_CONFIG_HOME environment variable", () => {
      const customXdg = join(testDir, "custom-config");
      process.env.XDG_CONFIG_HOME = customXdg;

      const paths = getConfigPaths();
      const xdgPath = paths.find((p) => p.includes(customXdg));

      expect(xdgPath).toBeDefined();
      // Should contain both ts and json variants
      expect(paths.some((p) => p.includes("custom-config/ubersearch/config.ts"))).toBe(true);
      expect(paths.some((p) => p.includes("custom-config/ubersearch/config.json"))).toBe(true);
    });

    it("should filter out undefined paths", () => {
      const paths = getConfigPaths();

      expect(paths.every((p) => p !== undefined && p !== null)).toBe(true);
    });
  });

  describe("loadConfig", () => {
    const validConfig: UberSearchConfig = {
      defaultEngineOrder: ["tavily", "brave"],
      engines: [
        {
          id: "tavily",
          type: "tavily" as const,
          enabled: true,
          displayName: "Tavily Search",
          apiKeyEnv: "TAVILY_API_KEY",
          endpoint: "https://api.tavily.com/search",
          searchDepth: "basic" as const,
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        },
      ],
      storage: {
        creditStatePath: "~/.local/state/ubersearch/credits.json",
      },
    };

    it("should load config from local directory", async () => {
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(validConfig));

      const config = await loadConfig();

      expect(config.defaultEngineOrder).toEqual(["tavily", "brave"]);
      expect(config.engines.length).toBe(1);
    });

    it("should load config from explicit path", async () => {
      const customPath = join(testDir, "custom-config.json");
      writeFileSync(customPath, JSON.stringify(validConfig));

      const config = await loadConfig(customPath);

      expect(config.defaultEngineOrder).toEqual(["tavily", "brave"]);
    });

    it("should load config from XDG config directory", async () => {
      const xdgDir = join(testDir, ".config", "ubersearch");
      mkdirSync(xdgDir, { recursive: true });

      const configPath = join(xdgDir, "config.json");
      writeFileSync(configPath, JSON.stringify(validConfig));

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");

      const config = await loadConfig();

      expect(config.defaultEngineOrder).toEqual(["tavily", "brave"]);
    });

    it("should prioritize local config over XDG config", async () => {
      // Create XDG config
      const xdgDir = join(testDir, ".config", "ubersearch");
      mkdirSync(xdgDir, { recursive: true });
      const xdgConfig = { ...validConfig, defaultEngineOrder: ["xdg"] };
      writeFileSync(join(xdgDir, "config.json"), JSON.stringify(xdgConfig));

      // Create local config
      const localConfig = { ...validConfig, defaultEngineOrder: ["local"] };
      writeFileSync(join(testDir, "ubersearch.config.json"), JSON.stringify(localConfig));

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");

      const config = await loadConfig();

      expect(config.defaultEngineOrder).toEqual(["local"]);
    });

    it("should load config when file exists", async () => {
      // Create a valid config file
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(validConfig));

      const config = await loadConfig();
      expect(config).toBeDefined();
    });

    it("should throw error when config file has invalid JSON", async () => {
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, "{ invalid json }");

      await expect(loadConfig()).rejects.toThrow("Failed to load config file");
    });

    it("should include file path in parse error message", async () => {
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, "{ invalid: }");

      try {
        await loadConfig();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain(configPath);
      }
    });

    it("should handle empty config file", async () => {
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, "{}");

      // Empty config doesn't pass validation, so skip validation for this edge case test
      const config = await loadConfig(undefined, { skipValidation: true });

      expect(typeof config).toBe("object");
    });

    it("should handle config with minimal fields", async () => {
      const minimalConfig = {
        defaultEngineOrder: [],
        engines: [],
      };

      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(minimalConfig));

      // Minimal config doesn't pass validation (requires at least 1 engine), so skip validation
      const config = await loadConfig(undefined, { skipValidation: true });

      expect(config.defaultEngineOrder).toEqual([]);
      expect(config.engines).toEqual([]);
    });

    it("should handle config with extra fields", async () => {
      const configWithExtras = {
        ...validConfig,
        extraField: "should be preserved",
        nested: { extra: "data" },
      };

      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(configWithExtras));

      const config = await loadConfig();

      expect((config as any).extraField).toBe("should be preserved");
      expect((config as any).nested.extra).toBe("data");
    });
  });

  describe("configExists", () => {
    it("should return false when no config exists", () => {
      // In temp dir with no config files
      expect(configExists()).toBe(false);
    });

    it("should return true when local config exists", () => {
      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, "{}");

      expect(configExists()).toBe(true);
    });

    it("should return true when local TS config exists", () => {
      const configPath = join(testDir, "ubersearch.config.ts");
      writeFileSync(configPath, "export default {}");

      expect(configExists()).toBe(true);
    });

    it("should return true when XDG config exists", () => {
      const xdgDir = join(testDir, ".config", "ubersearch");
      mkdirSync(xdgDir, { recursive: true });
      writeFileSync(join(xdgDir, "config.json"), "{}");

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");

      expect(configExists()).toBe(true);
    });

    it("should return true if any config path exists", () => {
      const xdgDir = join(testDir, ".config", "ubersearch");
      mkdirSync(xdgDir, { recursive: true });
      writeFileSync(join(xdgDir, "config.json"), "{}");

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");

      expect(configExists()).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle config file with UTF-8 characters", async () => {
      const configWithUtf8: UberSearchConfig = {
        defaultEngineOrder: ["tavily"],
        engines: [
          {
            id: "test",
            displayName: "Test 测试 🔍",
            type: "tavily" as const,
            enabled: true,
            apiKeyEnv: "TEST_KEY",
            endpoint: "https://example.com",
            searchDepth: "basic" as const,
            monthlyQuota: 100,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 80,
          },
        ],
      };

      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(configWithUtf8), "utf8");

      const config = await loadConfig();

      expect(config.engines[0]?.displayName).toBe("Test 测试 🔍");
    });

    it("should handle very large config files", async () => {
      const largeConfig: UberSearchConfig = {
        defaultEngineOrder: Array.from({ length: 100 }, (_, i) => `engine${i}`),
        engines: Array.from({ length: 100 }, (_, i) => ({
          id: `engine${i}`,
          type: "tavily" as const,
          enabled: true,
          displayName: `Engine ${i}`,
          apiKeyEnv: `KEY_${i}`,
          endpoint: `https://api${i}.example.com`,
          searchDepth: "basic" as const,
          monthlyQuota: 1000,
          creditCostPerSearch: 1,
          lowCreditThresholdPercent: 80,
        })),
      };

      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(largeConfig));

      const config = await loadConfig();

      expect(config.engines.length).toBe(100);
      expect(config.defaultEngineOrder.length).toBe(100);
    });

    it("should handle config with nested objects", async () => {
      const nestedConfig = {
        defaultEngineOrder: ["test"],
        engines: [
          {
            id: "test",
            type: "tavily" as const,
            enabled: true,
            displayName: "Test",
            apiKeyEnv: "TEST_KEY",
            endpoint: "https://example.com",
            searchDepth: "basic" as const,
            monthlyQuota: 100,
            creditCostPerSearch: 1,
            lowCreditThresholdPercent: 80,
            advanced: {
              nested: {
                deeply: {
                  value: "test",
                },
              },
            },
          },
        ],
      };

      const configPath = join(testDir, "ubersearch.config.json");
      writeFileSync(configPath, JSON.stringify(nestedConfig));

      const config = await loadConfig();

      expect((config.engines[0] as any).advanced.nested.deeply.value).toBe("test");
    });
  });
});
