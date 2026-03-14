/**
 * Plugin Registry
 *
 * Central registry for managing search provider plugins.
 * Handles plugin registration, lookup, and provider creation.
 */

import type { EngineConfigBase } from "../config/types";
import { getErrorMessage } from "../core/errorUtils";
import { createLogger } from "../core/logger";
import type {
  CreateProviderOptions,
  ManagedProvider,
  PluginDefinition,
  PluginInfo,
  PluginRegistrationOptions,
  PluginRegistrationResult,
} from "./types";

const log = createLogger("PluginRegistry");

/**
 * Central registry for search provider plugins
 *
 * The PluginRegistry provides:
 * - Plugin registration with optional overwrite
 * - Plugin lookup by type
 * - Provider creation from registered plugins
 * - Plugin metadata queries
 *
 * @example
 * ```typescript
 * // Get singleton instance
 * const registry = PluginRegistry.getInstance();
 *
 * // Register a plugin
 * registry.register(myPlugin);
 *
 * // Create a provider
 * const provider = registry.createProvider('my-provider', config);
 *
 * // Check if plugin exists
 * if (registry.has('my-provider')) { ... }
 * ```
 */
export class PluginRegistry {
  private static instance: PluginRegistry | null = null;

  /** Registered plugins by type */
  private plugins = new Map<string, PluginDefinition>();

  /** Track which plugins are built-in */
  private builtInTypes = new Set<string>();

  /**
   * Get the singleton instance of PluginRegistry
   */
  static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    PluginRegistry.instance = null;
  }

  /**
   * Private constructor - use getInstance()
   */
  private constructor() {}

  /**
   * Register a plugin
   *
   * @param plugin - Plugin definition to register
   * @param options - Registration options
   * @returns Registration result
   *
   * @example
   * ```typescript
   * const result = registry.register(myPlugin);
   * if (!result.success) {
   *   console.error(result.message);
   * }
   * ```
   */
  async register(
    plugin: PluginDefinition,
    options: PluginRegistrationOptions = {},
  ): Promise<PluginRegistrationResult> {
    const { overwrite = false } = options;

    // Check for existing registration
    if (this.plugins.has(plugin.type)) {
      if (!overwrite) {
        return {
          success: false,
          type: plugin.type,
          message: `Plugin type '${plugin.type}' is already registered. Use overwrite option to replace.`,
        };
      }

      // Call onUnregister for existing plugin if it exists
      const existing = this.plugins.get(plugin.type);
      if (existing?.onUnregister) {
        try {
          await existing.onUnregister();
        } catch (error) {
          // Log but don't fail - we still want to register the new plugin
          log.warn(`Error during onUnregister for plugin '${plugin.type}':`, error);
        }
      }
    }

    // Register the plugin
    this.plugins.set(plugin.type, plugin);

    // Call onRegister if provided
    if (plugin.onRegister) {
      try {
        await plugin.onRegister();
      } catch (error) {
        // Rollback registration on error
        this.plugins.delete(plugin.type);
        return {
          success: false,
          type: plugin.type,
          message: `Plugin onRegister failed: ${getErrorMessage(error)}`,
        };
      }
    }

    return {
      success: true,
      type: plugin.type,
      overwritten: overwrite && this.plugins.has(plugin.type),
    };
  }

  /**
   * Register a plugin synchronously (no lifecycle hooks called)
   */
  registerSync(
    plugin: PluginDefinition,
    options: PluginRegistrationOptions = {},
  ): PluginRegistrationResult {
    const { overwrite = false } = options;

    if (this.plugins.has(plugin.type) && !overwrite) {
      return {
        success: false,
        type: plugin.type,
        message: `Plugin type '${plugin.type}' is already registered.`,
      };
    }

    this.plugins.set(plugin.type, plugin);

    return {
      success: true,
      type: plugin.type,
      overwritten: overwrite && this.plugins.has(plugin.type),
    };
  }

  /**
   * Mark a plugin type as built-in
   * Built-in plugins are identified in metadata
   */
  markBuiltIn(type: string): void {
    this.builtInTypes.add(type);
  }

  /**
   * Unregister a plugin
   *
   * @param type - Plugin type to unregister
   * @returns true if plugin was removed, false if not found
   */
  async unregister(type: string): Promise<boolean> {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      return false;
    }

    // Call onUnregister if provided
    if (plugin.onUnregister) {
      await plugin.onUnregister();
    }

    this.plugins.delete(type);
    this.builtInTypes.delete(type);
    return true;
  }

  /**
   * Check if a plugin type is registered
   */
  has(type: string): boolean {
    return this.plugins.has(type);
  }

  /**
   * Get a plugin by type
   */
  get(type: string): PluginDefinition | undefined {
    return this.plugins.get(type);
  }

  /**
   * Get all registered plugin types
   */
  getTypes(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get metadata for all registered plugins
   */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map((plugin) => ({
      type: plugin.type,
      displayName: plugin.displayName,
      description: plugin.description,
      docsUrl: plugin.docsUrl,
      version: plugin.version,
      hasLifecycle: plugin.hasLifecycle,
      isBuiltIn: this.builtInTypes.has(plugin.type),
    }));
  }

  /**
   * Get metadata for a specific plugin
   */
  getPluginInfo(type: string): PluginInfo | undefined {
    const plugin = this.plugins.get(type);
    if (!plugin) {
      return undefined;
    }

    return {
      type: plugin.type,
      displayName: plugin.displayName,
      description: plugin.description,
      docsUrl: plugin.docsUrl,
      version: plugin.version,
      hasLifecycle: plugin.hasLifecycle,
      isBuiltIn: this.builtInTypes.has(type),
    };
  }

  /**
   * Create a provider instance from a plugin
   *
   * @param config - Engine configuration (must include 'type' field)
   * @param options - Creation options
   * @returns Provider instance
   * @throws Error if plugin not found or config validation fails
   *
   * @example
   * ```typescript
   * const config = { type: 'tavily', id: 'tavily', ... };
   * const provider = registry.createProvider(config);
   * ```
   */
  createProvider<T extends EngineConfigBase>(
    config: T & { type: string },
    options: CreateProviderOptions = {},
  ): ManagedProvider {
    const { container, skipValidation = false } = options;

    const plugin = this.plugins.get(config.type);
    if (!plugin) {
      throw new Error(
        `No plugin registered for type '${config.type}'. ` +
          `Available types: ${this.getTypes().join(", ") || "none"}`,
      );
    }

    // Validate config if schema provided and validation not skipped
    let validatedConfig = config;
    if (plugin.configSchema && !skipValidation) {
      try {
        validatedConfig = plugin.configSchema.validate(config) as T & { type: string };
      } catch (error) {
        throw new Error(
          `Config validation failed for plugin '${config.type}': ` + `${getErrorMessage(error)}`,
        );
      }
    }

    // Create provider using factory
    try {
      const provider = plugin.factory(validatedConfig, container);
      return provider as ManagedProvider;
    } catch (error) {
      const message = getErrorMessage(error);
      throw new Error(`Failed to create provider for plugin '${config.type}': ${message}`, {
        cause: error,
      });
    }
  }

  /**
   * Create multiple providers from configs
   */
  createProviders(
    configs: Array<EngineConfigBase & { type: string }>,
    options: CreateProviderOptions = {},
  ): ManagedProvider[] {
    return configs.map((config) => this.createProvider(config, options));
  }

  /**
   * Clear all registered plugins
   */
  async clear(): Promise<void> {
    // Call onUnregister for all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.onUnregister) {
        try {
          await plugin.onUnregister();
        } catch (error) {
          log.warn(`Error during onUnregister for plugin '${plugin.type}':`, error);
        }
      }
    }

    this.plugins.clear();
    this.builtInTypes.clear();
  }

  /**
   * Get count of registered plugins
   */
  get size(): number {
    return this.plugins.size;
  }
}

// Export singleton getter as convenience
export const getPluginRegistry = (): PluginRegistry => PluginRegistry.getInstance();
