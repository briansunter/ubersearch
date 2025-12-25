/**
 * Plugin System Types
 *
 * Defines the interfaces and types for the ai-search plugin system.
 * Plugins allow adding new search providers without modifying core code.
 */

import type { EngineConfigBase } from "../config/types";
import type { Container } from "../core/container";
import type { ILifecycleProvider, SearchProvider } from "../core/provider";

/**
 * Configuration schema for a plugin's engine configuration
 * Used for validation and TypeScript type inference
 */
export interface PluginConfigSchema<T extends EngineConfigBase = EngineConfigBase> {
  /** The type discriminator for this plugin */
  readonly type: string;

  /**
   * Validate the configuration
   * @param config - Raw configuration object
   * @returns Validated config or throws on validation failure
   */
  validate(config: unknown): T;

  /**
   * Get default values for optional fields
   */
  getDefaults(): Partial<T>;
}

/**
 * Factory function type for creating provider instances
 */
export type ProviderFactory<
  TConfig extends EngineConfigBase = EngineConfigBase,
  TProvider extends SearchProvider = SearchProvider,
> = (config: TConfig, container?: Container) => TProvider;

/**
 * Plugin definition interface
 *
 * A plugin provides everything needed to integrate a new search provider:
 * - Type identifier for config discrimination
 * - Config schema for validation
 * - Factory function for creating instances
 * - Metadata about the plugin
 *
 * @example
 * ```typescript
 * const myPlugin: PluginDefinition<MyConfig, MyProvider> = {
 *   type: 'my-provider',
 *   displayName: 'My Search Provider',
 *   description: 'A custom search provider',
 *   configSchema: myConfigSchema,
 *   factory: (config, container) => new MyProvider(config),
 *   hasLifecycle: false,
 * };
 * ```
 */
export interface PluginDefinition<
  TConfig extends EngineConfigBase = EngineConfigBase,
  TProvider extends SearchProvider = SearchProvider,
> {
  /**
   * Unique type identifier for this plugin
   * Used as discriminator in config objects (config.type)
   */
  readonly type: string;

  /**
   * Human-readable name for display
   */
  readonly displayName: string;

  /**
   * Brief description of the plugin
   */
  readonly description?: string;

  /**
   * URL to documentation
   */
  readonly docsUrl?: string;

  /**
   * Version of the plugin
   */
  readonly version?: string;

  /**
   * Configuration schema for validation
   */
  readonly configSchema?: PluginConfigSchema<TConfig>;

  /**
   * Factory function to create provider instances
   */
  readonly factory: ProviderFactory<TConfig, TProvider>;

  /**
   * Whether this provider implements ILifecycleProvider
   * If true, init/shutdown will be called
   */
  readonly hasLifecycle: boolean;

  /**
   * Optional initialization hook called when plugin is registered
   */
  onRegister?(): void | Promise<void>;

  /**
   * Optional cleanup hook called when plugin is unregistered
   */
  onUnregister?(): void | Promise<void>;
}

/**
 * Helper type to extract config type from a plugin definition
 */
export type PluginConfig<T> = T extends PluginDefinition<infer C, unknown> ? C : never;

/**
 * Helper type to extract provider type from a plugin definition
 */
export type PluginProvider<T> = T extends PluginDefinition<unknown, infer P> ? P : never;

/**
 * Registration options when adding a plugin to the registry
 */
export interface PluginRegistrationOptions {
  /**
   * Whether to overwrite if plugin type already exists
   * @default false
   */
  overwrite?: boolean;
}

/**
 * Result of plugin registration
 */
export interface PluginRegistrationResult {
  success: boolean;
  type: string;
  message?: string;
  overwritten?: boolean;
}

/**
 * Plugin metadata returned by registry queries
 */
export interface PluginInfo {
  type: string;
  displayName: string;
  description?: string;
  docsUrl?: string;
  version?: string;
  hasLifecycle: boolean;
  isBuiltIn: boolean;
}

/**
 * Options for creating a provider from a plugin
 */
export interface CreateProviderOptions {
  /**
   * DI container for dependency injection
   */
  container?: Container;

  /**
   * Whether to skip config validation
   * @default false
   */
  skipValidation?: boolean;
}

/**
 * Extended provider type that combines SearchProvider with optional lifecycle
 */
export type ManagedProvider = SearchProvider & Partial<ILifecycleProvider>;

/**
 * Type guard to check if a provider implements ILifecycleProvider
 */
export function isLifecycleProvider(
  provider: SearchProvider,
): provider is SearchProvider & ILifecycleProvider {
  if (provider == null || typeof provider !== "object") {
    return false;
  }
  const obj = provider as Record<string, unknown>;
  return (
    "init" in provider &&
    "healthcheck" in provider &&
    "shutdown" in provider &&
    typeof obj.init === "function" &&
    typeof obj.healthcheck === "function" &&
    typeof obj.shutdown === "function"
  );
}

/**
 * Type guard to check if a provider has lifecycle management enabled
 */
export function hasLifecycleManagement(provider: SearchProvider): boolean {
  if (isLifecycleProvider(provider)) {
    return typeof provider.isLifecycleManaged === "function" ? provider.isLifecycleManaged() : true;
  }
  return false;
}
