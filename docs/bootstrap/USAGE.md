# Bootstrap Module Usage Guide

The bootstrap module provides a centralized dependency injection container for the ai-search application. This replaces manual service instantiation with a clean, testable DI pattern.

## Quick Start

```typescript
import { bootstrapContainer } from "./bootstrap";
import { loadConfig } from "./config/load";

// Load configuration
const config = await loadConfig();

// Bootstrap the container
const container = await bootstrapContainer(config);

// Get services from the container
const orchestrator = await container.get("orchestrator");
const creditManager = await container.get("creditManager");

// Use the orchestrator
const results = await orchestrator.run("search query", {
  strategy: "first-success",
  limit: 10,
});
```

## Service Registration

The bootstrap process registers services in this order:

### 1. Configuration (Singleton)

```typescript
container.singleton("config", () => config);
```

### 2. Credit State Provider (Singleton)

```typescript
container.singleton(
  "creditStateProvider",
  () => new FileCreditStateProvider(config.storage?.creditStatePath),
);
```

### 3. Credit Manager (Singleton, Async)

```typescript
container.singleton("creditManager", async () => {
  const provider = await container.get<CreditStateProvider>(
    "creditStateProvider",
  );
  const manager = new CreditManager(config.engines, provider);
  await manager.initialize(); // Load state from provider
  return manager;
});
```

### 4. Provider Registry (Singleton)

```typescript
container.singleton("providerRegistry", () => new ProviderRegistry());
```

### 5. Search Providers (Registered in Provider Registry)

```typescript
for (const engineConfig of config.engines) {
  if (!engineConfig.enabled) continue;

  const provider = createProvider(engineConfig, container);
  providerRegistry.register(provider);
}
```

### 6. Strategy Factory (Singleton)

```typescript
container.singleton("strategyFactory", () => StrategyFactory);
```

### 7. Orchestrator (Singleton)

```typescript
container.singleton(
  "orchestrator",
  () =>
    new AiSearchOrchestrator(
      container.get("config"),
      container.get("creditManager"),
      container.get("providerRegistry"),
    ),
);
```

## Provider Creation

The `createProvider` factory function handles different provider types:

```typescript
function createProvider(
  config: EngineConfig,
  container: Container,
): SearchProvider {
  switch (config.type) {
    case "tavily":
      return new TavilyProvider(config);
    case "brave":
      return new BraveProvider(config);
    case "linkup":
      return new LinkupProvider(config); // Composes DockerLifecycleManager
    case "searchxng":
      return new SearchxngProvider(config); // Composes DockerLifecycleManager
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
```

## Error Handling

The bootstrap process includes comprehensive error handling:

1. **Provider Registration Failures**: Individual provider failures don't crash the entire bootstrap
2. **Credit Manager Initialization**: Async initialization with proper error propagation
3. **Graceful Shutdown**: Attempts to cleanup initialized providers on critical failure
4. **Detailed Logging**: Clear error messages and warnings for troubleshooting

## Container Lifetime Management

### Getting Services

```typescript
// Async resolution (recommended)
const orchestrator = await container.get("orchestrator");

// Sync resolution (only for already-created singletons)
const config = container.getSync("config");
```

### Checking Service Registration

```typescript
if (container.has("orchestrator")) {
  const orchestrator = await container.get("orchestrator");
}
```

### Container Inspection

```typescript
// Get all registered service keys
const services = container.keys();

// Get registration info for debugging
const info = container.getRegistration("orchestrator");
```

## Testing with DI Container

The DI container makes testing much easier:

```typescript
import { Container } from "../core/container";
import { MemoryCreditStateProvider } from "../test/mocks/MemoryCreditStateProvider";

// Create test container
const container = new Container();

// Register test doubles
container.singleton(
  "creditStateProvider",
  () => new MemoryCreditStateProvider(),
);

// Register real services that depend on test doubles
container.singleton("creditManager", async () => {
  const provider = await container.get("creditStateProvider");
  return new CreditManager(testEngines, provider);
});

// Use in tests
const creditManager = await container.get("creditManager");
```

## Migration from Manual Instantiation

### Before (Manual)

```typescript
const config = await loadConfig();
const creditProvider = new FileCreditStateProvider();
const creditManager = new CreditManager(config.engines, creditProvider);
await creditManager.initialize();

const registry = new ProviderRegistry();
const tavilyProvider = new TavilyProvider(
  config.engines.find((e) => e.type === "tavily"),
);
registry.register(tavilyProvider);
// ... register other providers

const orchestrator = new AiSearchOrchestrator(
  config,
  creditManager,
  registry,
);
```

### After (DI Container)

```typescript
const config = await loadConfig();
const container = await bootstrapContainer(config);
const orchestrator = await container.get("orchestrator");
```

## Benefits

✅ **Single Source of Truth**: All dependency wiring in one place
✅ **Testable**: Easy to mock dependencies for unit tests
✅ **Type Safe**: Full TypeScript support with proper typing
✅ **Lifecycle Management**: Proper singleton/transient handling
✅ **Error Handling**: Comprehensive error handling and logging
✅ **Extensible**: Easy to add new services or providers
✅ **Clean Architecture**: Separates configuration from instantiation

## Troubleshooting

### Common Issues

1. **"Service not registered" errors**: Check that the service key matches exactly
2. **Provider registration failures**: Check environment variables and configuration
3. **Async initialization errors**: Ensure `await` is used with `container.get()`

### Debug Information

Enable debug logging to see detailed bootstrap information:

```typescript
const container = await bootstrapContainer(config);
console.log("Registered services:", container.keys());
```

The bootstrap process logs:

- Successful provider registrations
- Warnings for failed providers
- Credit manager initialization status
- Final service count summary
