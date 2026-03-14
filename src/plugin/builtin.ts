/**
 * Built-in Plugin Definitions
 *
 * Registers the core search providers as plugins:
 * - Tavily
 * - Brave
 * - Linkup
 * - SearchXNG
 */

import type { BraveConfig, LinkupConfig, SearchxngConfig, TavilyConfig } from "../config/types";
import { BraveProvider } from "../providers/brave";
import { LinkupProvider } from "../providers/linkup";
import { SearchxngProvider } from "../providers/searchxng";
import { TavilyProvider } from "../providers/tavily";
import { PluginRegistry } from "./PluginRegistry";
import type { PluginDefinition } from "./types";

/**
 * Tavily plugin definition
 */
export const tavilyPlugin: PluginDefinition<TavilyConfig, TavilyProvider> = {
  type: "tavily",
  displayName: "Tavily",
  description: "AI-powered search API with high-quality results",
  docsUrl: "https://docs.tavily.com/",
  version: "1.0.0",
  hasLifecycle: false,
  factory: (config) => new TavilyProvider(config),
};

/**
 * Brave plugin definition
 */
export const bravePlugin: PluginDefinition<BraveConfig, BraveProvider> = {
  type: "brave",
  displayName: "Brave Search",
  description: "Privacy-focused search engine API",
  docsUrl: "https://api.search.brave.com/app/documentation",
  version: "1.0.0",
  hasLifecycle: false,
  factory: (config) => new BraveProvider(config),
};

/**
 * Linkup plugin definition
 */
export const linkupPlugin: PluginDefinition<LinkupConfig, LinkupProvider> = {
  type: "linkup",
  displayName: "Linkup",
  description: "Web search API with Docker support",
  docsUrl: "https://docs.linkup.ai/",
  version: "1.0.0",
  hasLifecycle: true,
  factory: (config) => new LinkupProvider(config),
};

/**
 * SearchXNG plugin definition
 */
export const searchxngPlugin: PluginDefinition<SearchxngConfig, SearchxngProvider> = {
  type: "searchxng",
  displayName: "SearXNG (Local)",
  description: "Self-hosted meta search engine with Docker auto-start",
  docsUrl: "https://docs.searxng.org/",
  version: "1.0.0",
  hasLifecycle: true,
  factory: (config) => new SearchxngProvider(config),
};

/**
 * All built-in plugins
 *
 * Each plugin has a specific config/provider type (e.g. TavilyConfig/TavilyProvider),
 * but consumers only need the base PluginDefinition interface. The factory parameter
 * is contravariant in TConfig, so TypeScript disallows a direct assignment; however,
 * the cast is safe because each specific config extends EngineConfigBase and each
 * provider extends SearchProvider.
 */
export const builtInPlugins = [
  tavilyPlugin,
  bravePlugin,
  linkupPlugin,
  searchxngPlugin,
] as unknown as PluginDefinition[];

/**
 * Register all built-in plugins with the registry
 *
 * @param registry - Plugin registry instance (defaults to singleton)
 * @returns Array of registration results
 *
 * @example
 * ```typescript
 * // Register with default singleton
 * await registerBuiltInPlugins();
 *
 * // Or with custom registry
 * const registry = new PluginRegistry();
 * await registerBuiltInPlugins(registry);
 * ```
 */
export async function registerBuiltInPlugins(
  registry: PluginRegistry = PluginRegistry.getInstance(),
): Promise<void> {
  for (const plugin of builtInPlugins) {
    const result = registry.registerSync(plugin);
    if (result.success) {
      registry.markBuiltIn(plugin.type);
    }
  }
}

/**
 * Check if built-in plugins are registered
 */
export function areBuiltInPluginsRegistered(
  registry: PluginRegistry = PluginRegistry.getInstance(),
): boolean {
  return builtInPlugins.every((plugin) => registry.has(plugin.type));
}

/**
 * Get list of built-in plugin types
 */
export function getBuiltInPluginTypes(): string[] {
  return builtInPlugins.map((p) => p.type);
}
