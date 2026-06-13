/**
 * Plugin System
 *
 * Exports all plugin-related types, classes, and utilities.
 */

// Built-in plugins
export {
  areBuiltInPluginsRegistered,
  bravePlugin,
  builtInPlugins,
  getBuiltInPluginTypes,
  linkupPlugin,
  registerBuiltInPlugins,
  searchxngPlugin,
  searxngPlugin,
  tavilyPlugin,
} from "./builtin";
// Registry
export { getPluginRegistry, PluginRegistry } from "./PluginRegistry";
// Types
export type {
  CreateProviderOptions,
  ManagedProvider,
  PluginConfig,
  PluginConfigSchema,
  PluginDefinition,
  PluginInfo,
  PluginProvider,
  PluginRegistrationOptions,
  PluginRegistrationResult,
  ProviderFactory,
} from "./types";
export { hasLifecycleManagement, isLifecycleProvider } from "./types";
