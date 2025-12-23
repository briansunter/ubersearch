/**
 * Bootstrap the Dependency Injection Container
 *
 * Sets up all services and their dependencies
 */

import { loadConfig } from "../config/load";
import type { EngineConfig, MultiSearchConfig } from "../config/types";
import { type Container, container } from "../core/container";
import { CreditManager } from "../core/credits";
import { FileCreditStateProvider } from "../core/credits/FileCreditStateProvider";
import { createLogger } from "../core/logger";
import { MultiSearchOrchestrator } from "../core/orchestrator";
import type { ILifecycleProvider, SearchProvider } from "../core/provider";
import { ProviderRegistry } from "../core/provider";
import { ProviderFactory } from "../core/provider/ProviderFactory";
import { ServiceKeys } from "../core/serviceKeys";
import { StrategyFactory } from "../core/strategy/StrategyFactory";
import { PluginRegistry as PluginReg, registerBuiltInPlugins } from "../plugin";

const log = createLogger("Bootstrap");

/**
 * Bootstrap options
 */
export interface BootstrapOptions {
  /** Custom credit state path (overrides config) */
  creditStatePath?: string;
  /** Skip plugin registration (for testing) */
  skipPluginRegistration?: boolean;
}

/**
 * Bootstrap the DI container with all services
 *
 * @param configOrPath - Either a config file path (string) or a config object directly
 * @param options - Bootstrap options (or legacy creditStatePath string)
 */
export async function bootstrapContainer(
  configOrPath?: string | MultiSearchConfig,
  options?: BootstrapOptions | string,
): Promise<Container> {
  // Clear existing registrations (useful for testing)
  container.reset();

  // Handle legacy second argument (creditStatePath)
  const opts: BootstrapOptions =
    typeof options === "string" ? { creditStatePath: options } : (options ?? {});

  // Load or use provided configuration
  let config: MultiSearchConfig;
  if (typeof configOrPath === "object" && configOrPath !== null) {
    // Config object provided directly (useful for testing)
    config = configOrPath;

    // Ensure plugins are registered when config is provided directly
    if (!opts.skipPluginRegistration) {
      await registerBuiltInPlugins(PluginReg.getInstance());
    }
  } else {
    // Load from file (plugins registered by loadConfig)
    config = await loadConfig(configOrPath);
  }

  // Register configuration as singleton
  container.singleton(ServiceKeys.CONFIG, () => config);

  // Register credit state provider
  container.singleton(ServiceKeys.CREDIT_STATE_PROVIDER, () => {
    const creditStatePath = opts.creditStatePath ?? config.storage?.creditStatePath;
    return new FileCreditStateProvider(creditStatePath);
  });

  // Register credit manager
  container.singleton(ServiceKeys.CREDIT_MANAGER, () => {
    const enabledEngines = config.engines.filter((e) => e.enabled);
    const stateProvider = container.get<FileCreditStateProvider>(ServiceKeys.CREDIT_STATE_PROVIDER);
    return new CreditManager(enabledEngines, stateProvider);
  });

  // Register provider registry
  container.singleton(ServiceKeys.PROVIDER_REGISTRY, () => {
    const registry = new ProviderRegistry();
    const failedProviders: string[] = [];

    // Register all enabled providers
    for (const engineConfig of config.engines) {
      if (!engineConfig.enabled) {
        continue;
      }

      try {
        const provider = createProvider(engineConfig);
        registry.register(provider);
        log.info(`Registered provider: ${engineConfig.id}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to register provider ${engineConfig.id}: ${errorMsg}`);
        failedProviders.push(engineConfig.id);
      }
    }

    const availableProviders = registry.list();
    if (availableProviders.length === 0) {
      throw new Error(
        `No providers could be registered. Failed providers: ${failedProviders.join(", ")}. ` +
          "Check your configuration and environment variables.",
      );
    }

    if (failedProviders.length > 0) {
      log.warn(`Some providers failed to initialize: ${failedProviders.join(", ")}`);
    }

    return registry;
  });

  // Register strategy factory
  container.singleton(ServiceKeys.STRATEGY_FACTORY, () => StrategyFactory);

  // Register orchestrator
  container.singleton(ServiceKeys.ORCHESTRATOR, () => {
    const creditManager = container.get<CreditManager>(ServiceKeys.CREDIT_MANAGER);
    const providerRegistry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
    return new MultiSearchOrchestrator(config, creditManager, providerRegistry);
  });

  // Initialize services that need async setup
  const creditManager = container.get<CreditManager>(ServiceKeys.CREDIT_MANAGER);
  await creditManager.initialize();

  // Resolve provider registry to trigger validation (throws if no providers registered)
  container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);

  return container;
}

/**
 * Create a provider instance based on engine configuration
 */
function createProvider(engineConfig: EngineConfig): SearchProvider {
  return ProviderFactory.createProvider(engineConfig, container);
}

/**
 * Helper function to check if a provider implements ILifecycleProvider
 */
export function isLifecycleProvider(provider: unknown): provider is ILifecycleProvider {
  return (
    provider != null &&
    typeof provider === "object" &&
    "init" in provider &&
    typeof provider.init === "function" &&
    "healthcheck" in provider &&
    typeof provider.healthcheck === "function"
  );
}
