/**
 * Configuration Helper Functions
 *
 * Provides type-safe helpers for defining ubersearch configurations.
 * Inspired by Vite's defineConfig pattern.
 */

import type { SearchProvider } from "../core/provider";
import type { PluginDefinition } from "../plugin/types";
import type {
  BraveConfig,
  EngineConfig,
  EngineConfigBase,
  LinkupConfig,
  UberSearchConfig,
  SearchxngConfig,
  TavilyConfig,
} from "./types";

/**
 * Extended configuration that supports plugins
 */
export interface ExtendedSearchConfig extends UberSearchConfig {
  /**
   * Custom plugins to register
   * These will be registered before creating providers
   */
  plugins?: PluginDefinition[];
}

/**
 * Configuration factory function type
 * Allows async config creation for loading secrets, etc.
 */
export type ConfigFactory = () => ExtendedSearchConfig | Promise<ExtendedSearchConfig>;

/**
 * Define a ubersearch configuration with full type safety
 *
 * @param config - Configuration object or factory function
 * @returns The configuration (passthrough with type inference)
 *
 * @example
 * ```typescript
 * // ubersearch.config.ts
 * import { defineConfig } from 'ubersearch';
 *
 * export default defineConfig({
 *   defaultEngineOrder: ['tavily', 'brave'],
 *   engines: [
 *     defineTavily({
 *       id: 'tavily',
 *       enabled: true,
 *       displayName: 'Tavily Search',
 *       apiKeyEnv: 'TAVILY_API_KEY',
 *       endpoint: 'https://api.tavily.com/search',
 *       searchDepth: 'basic',
 *       monthlyQuota: 1000,
 *       creditCostPerSearch: 1,
 *       lowCreditThresholdPercent: 80,
 *     }),
 *   ],
 * });
 * ```
 */
export function defineConfig(config: ExtendedSearchConfig): ExtendedSearchConfig;
export function defineConfig(factory: ConfigFactory): ConfigFactory;
export function defineConfig(
  configOrFactory: ExtendedSearchConfig | ConfigFactory,
): ExtendedSearchConfig | ConfigFactory {
  return configOrFactory;
}

/**
 * Helper to define a Tavily engine configuration
 */
export function defineTavily(
  config: Omit<TavilyConfig, "type"> & Partial<Pick<TavilyConfig, "type">>,
): TavilyConfig {
  return {
    type: "tavily",
    ...config,
  };
}

/**
 * Helper to define a Brave engine configuration
 */
export function defineBrave(
  config: Omit<BraveConfig, "type"> & Partial<Pick<BraveConfig, "type">>,
): BraveConfig {
  return {
    type: "brave",
    ...config,
  };
}

/**
 * Helper to define a Linkup engine configuration
 */
export function defineLinkup(
  config: Omit<LinkupConfig, "type"> & Partial<Pick<LinkupConfig, "type">>,
): LinkupConfig {
  return {
    type: "linkup",
    ...config,
  };
}

/**
 * Helper to define a SearXNG engine configuration
 */
export function defineSearchxng(
  config: Omit<SearchxngConfig, "type"> & Partial<Pick<SearchxngConfig, "type">>,
): SearchxngConfig {
  return {
    type: "searchxng",
    ...config,
  };
}

/**
 * Generic helper for custom engine types
 *
 * @example
 * ```typescript
 * interface MyCustomConfig extends EngineConfigBase {
 *   type: 'my-custom';
 *   customOption: string;
 * }
 *
 * const myEngine = defineEngine<MyCustomConfig>({
 *   type: 'my-custom',
 *   id: 'my-custom',
 *   // ...
 * });
 * ```
 */
export function defineEngine<T extends EngineConfig>(config: T): T {
  return config;
}

/**
 * Helper to define a custom plugin
 *
 * @example
 * ```typescript
 * const myPlugin = definePlugin({
 *   type: 'my-search',
 *   displayName: 'My Search',
 *   hasLifecycle: false,
 *   factory: (config) => new MySearchProvider(config),
 * });
 * ```
 */
export function definePlugin<TConfig extends EngineConfigBase, TProvider extends SearchProvider>(
  plugin: PluginDefinition<TConfig, TProvider>,
): PluginDefinition<TConfig, TProvider> {
  return plugin;
}

/**
 * Create a configuration with defaults
 */
export function createConfig(
  engines: EngineConfig[],
  options: Partial<Omit<ExtendedSearchConfig, "engines">> = {},
): ExtendedSearchConfig {
  const enabledEngines = engines.filter((e) => e.enabled);
  return {
    defaultEngineOrder: options.defaultEngineOrder ?? enabledEngines.map((e) => e.id),
    engines,
    storage: options.storage,
    plugins: options.plugins,
  };
}
