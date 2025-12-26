/**
 * Bootstrap the Dependency Injection Container
 *
 * Sets up all services and their dependencies
 */

import { loadConfig } from "../config/load";
import type { EngineConfig, UberSearchConfig } from "../config/types";
import { type Container, container } from "../core/container";
import { CreditManager } from "../core/credits";
import { FileCreditStateProvider } from "../core/credits/FileCreditStateProvider";
import { createLogger } from "../core/logger";
import { UberSearchOrchestrator } from "../core/orchestrator";
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
  configOrPath?: string | UberSearchConfig,
  options?: BootstrapOptions | string,
): Promise<Container> {
  // Clear existing registrations (useful for testing)
  container.reset();

  // Handle legacy second argument (creditStatePath)
  const opts: BootstrapOptions =
    typeof options === "string" ? { creditStatePath: options } : (options ?? {});

  // Load or use provided configuration
  let config: UberSearchConfig;
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
    const skippedProviders: string[] = [];

    // Register all enabled providers
    for (const engineConfig of config.engines) {
      if (!engineConfig.enabled) {
        continue;
      }

      try {
        const provider = createProvider(engineConfig);

        // Skip providers that aren't configured (e.g., missing API key)
        if (!provider.isConfigured()) {
          log.debug(`Skipping provider ${engineConfig.id}: ${provider.getMissingConfigMessage()}`);
          skippedProviders.push(engineConfig.id);
          continue;
        }

        registry.register(provider);
        log.debug(`Registered provider: ${engineConfig.id}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.debug(`Failed to register provider ${engineConfig.id}: ${errorMsg}`);
        failedProviders.push(engineConfig.id);
      }
    }

    const availableProviders = registry.list();
    if (availableProviders.length === 0) {
      const allSkipped = [...failedProviders, ...skippedProviders];
      const skipDetails = allSkipped.length > 0 ? `Skipped: ${allSkipped.join(", ")}. ` : "";
      throw new Error(
        `No search providers available. ${skipDetails}\n\n` +
          "To fix this, either:\n" +
          "  1. Set an API key: export TAVILY_API_KEY=your-key (or BRAVE_API_KEY, LINKUP_API_KEY)\n" +
          "  2. Start the SearXNG Docker container: docker compose up -d\n" +
          "  3. Create a config file: ubersearch.config.json\n\n" +
          "Get API keys at: https://tavily.com, https://brave.com/search/api, https://linkup.so",
      );
    }

    if (failedProviders.length > 0) {
      log.debug(`Some providers failed to initialize: ${failedProviders.join(", ")}`);
    }

    return registry;
  });

  // Register strategy factory
  container.singleton(ServiceKeys.STRATEGY_FACTORY, () => StrategyFactory);

  // Register orchestrator
  container.singleton(ServiceKeys.ORCHESTRATOR, () => {
    const creditManager = container.get<CreditManager>(ServiceKeys.CREDIT_MANAGER);
    const providerRegistry = container.get<ProviderRegistry>(ServiceKeys.PROVIDER_REGISTRY);
    return new UberSearchOrchestrator(config, creditManager, providerRegistry);
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
