/**
 * Configuration loader with multi-path resolution and validation
 *
 * Supports multiple config formats:
 * - JSON: ubersearch.config.json
 * - TypeScript: ubersearch.config.ts (with defineConfig helper)
 *
 * Config resolution order:
 * 1. Explicit path (if provided)
 * 2. Local directory (./ubersearch.config.{ts,json})
 * 3. XDG config ($XDG_CONFIG_HOME/ubersearch/config.{ts,json})
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PluginRegistry, registerBuiltInPlugins } from "../plugin";
import type { ConfigFactory, ExtendedSearchConfig } from "./defineConfig";
import { formatValidationErrors, validateConfigSafe } from "./validation";

/**
 * Get package root directory
 * Handles both development (src/) and bundled (dist/) environments
 */
function getPackageRoot(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // Check if we're in dist/ or src/
  if (currentDir.includes("/dist")) {
    // Bundled: dist/cli.js -> go up 1 level
    return dirname(currentDir);
  }
  // Development: src/config/load.ts -> go up 2 levels
  return dirname(dirname(currentDir));
}

/** Supported config file extensions */
const CONFIG_EXTENSIONS = [".ts", ".json"] as const;

/** Config file base names */
const CONFIG_BASENAMES = {
  local: "ubersearch.config",
  xdg: "config",
} as const;

/**
 * Get local config paths (current directory)
 * Returns paths for both .ts and .json variants
 */
function getLocalConfigPaths(): string[] {
  const base = join(process.cwd(), CONFIG_BASENAMES.local);
  return CONFIG_EXTENSIONS.map((ext) => `${base}${ext}`);
}

/**
 * Get XDG config paths ($XDG_CONFIG_HOME/ubersearch/config.{ts,json})
 */
function getXdgConfigPaths(): string[] {
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir = xdg ?? join(homedir(), ".config");
  const base = join(baseDir, "ubersearch", CONFIG_BASENAMES.xdg);
  return CONFIG_EXTENSIONS.map((ext) => `${base}${ext}`);
}

/**
 * Get all possible config file paths in order of preference
 * TypeScript files are preferred over JSON when both exist
 */
export function getConfigPaths(explicitPath?: string): string[] {
  const paths: string[] = [];

  // Explicit path first (if provided)
  if (explicitPath) {
    paths.push(explicitPath);
  }

  // Local directory (prefer .ts over .json)
  paths.push(...getLocalConfigPaths());

  // XDG config (prefer .ts over .json)
  paths.push(...getXdgConfigPaths());

  return paths;
}

/**
 * Check if a path is a TypeScript config
 */
function isTypeScriptConfig(filePath: string): boolean {
  return filePath.endsWith(".ts");
}

/**
 * Load a TypeScript config file
 * Uses Bun's native TS support for importing
 */
async function loadTypeScriptConfig(path: string): Promise<ExtendedSearchConfig> {
  try {
    // Use dynamic import for TS files
    // Bun natively supports importing .ts files
    const module = await import(path);

    // Config can be default export or named 'config'
    const configOrFactory = module.default ?? module.config;

    if (!configOrFactory) {
      throw new Error(`Config file must export a default configuration or named 'config' export`);
    }

    // Handle factory functions (async config)
    if (typeof configOrFactory === "function") {
      return await (configOrFactory as ConfigFactory)();
    }

    return configOrFactory as ExtendedSearchConfig;
  } catch (error) {
    throw new Error(
      `Failed to load TypeScript config from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Load a JSON config file
 */
function loadJsonConfig(path: string): ExtendedSearchConfig {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

/**
 * Resolve relative paths in config to absolute paths
 * This ensures paths like ./providers/searxng/docker-compose.yml work
 * when running from any directory
 *
 * @param config - The loaded configuration
 * @param configFilePath - The absolute path to the config file
 * @returns Config with resolved absolute paths
 */
function resolveConfigPaths(
  config: ExtendedSearchConfig,
  configFilePath: string,
): ExtendedSearchConfig {
  // Handle empty or malformed config
  if (!config.engines || !Array.isArray(config.engines)) {
    return config;
  }

  const configDir = dirname(configFilePath);

  return {
    ...config,
    engines: config.engines.map((engine) => {
      // Check if engine has composeFile property (SearXNG type)
      if ("composeFile" in engine && engine.composeFile) {
        // Only resolve if it's a relative path
        if (!isAbsolute(engine.composeFile)) {
          return {
            ...engine,
            composeFile: join(configDir, engine.composeFile),
          };
        }
      }
      return engine;
    }),
  };
}

/**
 * Options for loading configuration
 */
export interface LoadConfigOptions {
  /** Skip config validation */
  skipValidation?: boolean;
  /** Custom plugin registry (defaults to singleton) */
  registry?: PluginRegistry;
  /** Skip registering built-in plugins */
  skipBuiltInPlugins?: boolean;
}

/**
 * Load configuration from the first available config file
 * Supports both JSON and TypeScript configurations
 *
 * @param explicitPath Optional explicit path to config file
 * @param options Optional loading options
 * @returns Parsed and validated configuration
 * @throws Error if no config file is found or validation fails
 *
 * @example
 * ```typescript
 * // Load from default locations
 * const config = await loadConfig();
 *
 * // Load from specific path
 * const config = await loadConfig('./my-config.ts');
 *
 * // Load with options
 * const config = await loadConfig(undefined, { skipValidation: true });
 * ```
 */
/**
 * Get default configuration when no config file is found
 * SearXNG is always first (free, unlimited), then cloud providers by free tier generosity
 */
function getDefaultConfig(): ExtendedSearchConfig {
  const engines: ExtendedSearchConfig["engines"] = [];
  const defaultEngineOrder: string[] = [];

  // Always add SearXNG first - it's free and unlimited (requires Docker)
  const packageRoot = getPackageRoot();
  const composeFile = join(packageRoot, "providers", "searxng", "docker-compose.yml");

  defaultEngineOrder.push("searchxng");
  engines.push({
    id: "searchxng",
    type: "searchxng",
    enabled: true,
    displayName: "SearXNG (Local)",
    apiKeyEnv: "SEARXNG_API_KEY",
    endpoint: "http://localhost:8888/search",
    composeFile,
    containerName: "searxng",
    healthEndpoint: "http://localhost:8888/healthz",
    defaultLimit: 15,
    monthlyQuota: 10000,
    creditCostPerSearch: 0,
    lowCreditThresholdPercent: 80,
    autoStart: true,
    autoStop: true,
    initTimeoutMs: 60000,
  });

  // Add cloud providers in order of free tier generosity: Brave (2000/mo) > Tavily (1000/mo) > Linkup
  if (process.env.BRAVE_API_KEY) {
    defaultEngineOrder.push("brave");
    engines.push({
      id: "brave",
      type: "brave",
      enabled: true,
      displayName: "Brave Search",
      apiKeyEnv: "BRAVE_API_KEY",
      endpoint: "https://api.search.brave.com/res/v1/web/search",
      defaultLimit: 15,
      monthlyQuota: 2000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
    });
  }

  if (process.env.TAVILY_API_KEY) {
    defaultEngineOrder.push("tavily");
    engines.push({
      id: "tavily",
      type: "tavily",
      enabled: true,
      displayName: "Tavily Search",
      apiKeyEnv: "TAVILY_API_KEY",
      endpoint: "https://api.tavily.com/search",
      searchDepth: "basic",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
    });
  }

  if (process.env.LINKUP_API_KEY) {
    defaultEngineOrder.push("linkup");
    engines.push({
      id: "linkup",
      type: "linkup",
      enabled: true,
      displayName: "Linkup Search",
      apiKeyEnv: "LINKUP_API_KEY",
      endpoint: "https://api.linkup.so/v1/search",
      monthlyQuota: 1000,
      creditCostPerSearch: 1,
      lowCreditThresholdPercent: 80,
    });
  }

  return { defaultEngineOrder, engines };
}

export async function loadConfig(
  explicitPath?: string,
  options: LoadConfigOptions = {},
): Promise<ExtendedSearchConfig> {
  const { skipValidation = false, registry, skipBuiltInPlugins = false } = options;
  const paths = getConfigPaths(explicitPath);

  for (const path of paths) {
    if (existsSync(path)) {
      let rawConfig: ExtendedSearchConfig;

      try {
        if (isTypeScriptConfig(path)) {
          rawConfig = await loadTypeScriptConfig(path);
        } else {
          rawConfig = loadJsonConfig(path);
        }
      } catch (error) {
        throw new Error(
          `Failed to load config file at ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Resolve relative paths (like composeFile) to absolute paths
      // based on the config file's directory
      rawConfig = resolveConfigPaths(rawConfig, path);

      // Skip validation if explicitly requested (useful for testing)
      if (!skipValidation) {
        // Validate configuration against schema
        const result = validateConfigSafe(rawConfig);
        if (!result.success) {
          const errors = formatValidationErrors(result.error);
          throw new Error(
            `Invalid configuration in ${path}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
          );
        }
        rawConfig = result.data as ExtendedSearchConfig;
      }

      // Register plugins
      const pluginRegistry = registry ?? PluginRegistry.getInstance();

      // Register built-in plugins first (unless skipped)
      if (!skipBuiltInPlugins) {
        await registerBuiltInPlugins(pluginRegistry);
      }

      // Register any custom plugins from config
      if (rawConfig.plugins) {
        for (const plugin of rawConfig.plugins) {
          await pluginRegistry.register(plugin);
        }
      }

      return rawConfig;
    }
  }

  // No config file found - use default configuration (silent)
  const defaultConfig = getDefaultConfig();

  // Register plugins for default config
  const pluginRegistry = registry ?? PluginRegistry.getInstance();
  if (!skipBuiltInPlugins) {
    await registerBuiltInPlugins(pluginRegistry);
  }

  return defaultConfig;
}

/**
 * Synchronous version of loadConfig for JSON files only
 * @deprecated Use loadConfig() for full TypeScript support
 */
export function loadConfigSync(
  explicitPath?: string,
  options: { skipValidation?: boolean } = {},
): ExtendedSearchConfig {
  const paths = getConfigPaths(explicitPath);

  for (const path of paths) {
    if (existsSync(path)) {
      // Skip TypeScript files in sync mode
      if (isTypeScriptConfig(path)) {
        continue;
      }

      let rawConfig: ExtendedSearchConfig;

      try {
        rawConfig = loadJsonConfig(path);
      } catch (error) {
        throw new Error(
          `Failed to parse config file at ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Resolve relative paths (like composeFile) to absolute paths
      rawConfig = resolveConfigPaths(rawConfig, path);

      if (options.skipValidation) {
        return rawConfig;
      }

      const result = validateConfigSafe(rawConfig);
      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        throw new Error(
          `Invalid configuration in ${path}:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
        );
      }

      return result.data as ExtendedSearchConfig;
    }
  }

  return getDefaultConfig();
}

/**
 * Check if a config file exists at any of the standard locations
 */
export function configExists(): boolean {
  const paths = getConfigPaths();
  return paths.some((path) => existsSync(path));
}
