# Dependency Injection Container

The ubersearch project includes a comprehensive Dependency Injection (DI) Container that manages service registration and resolution. This eliminates manual instantiation throughout the codebase and provides a clean, testable architecture.

## Overview

The DI Container is a lightweight, type-safe service locator that supports:

- ✅ **Singleton and Transient Lifetimes**: Register services as cached singletons or create new instances each time
- ✅ **Circular Dependency Detection**: Automatically detects and reports circular dependencies with clear error messages
- ✅ **Factory Pattern**: Lazy instantiation via factory functions with container access
- ✅ **Type Safety**: Full TypeScript support with generic methods
- ✅ **Service Introspection**: Debug and inspect registered services
- ✅ **Error Handling**: Descriptive errors with suggestions for missing services

## Core Types

### ServiceIdentifier

```typescript
export type ServiceIdentifier<T = any> = string | Symbol;
```

Services can be identified by strings or Symbols:

```typescript
container.bind("config", () => loadConfig());
container.bind(Symbol("logger"), () => new Logger());
```

### ContainerBinding

```typescript
export interface ContainerBinding<T> {
  factory: (container: Container) => T;
  singleton: boolean;
  cached?: T;
}
```

Internal binding configuration that stores the factory function and singleton state.

## Container API

### Registration Methods

#### `bind<T>(id: ServiceIdentifier<T>, factory: (container: Container) => T): void`

Register a transient service (new instance each time).

```typescript
container.bind(
  "searchStrategy",
  (c) => new AllProvidersStrategy(c.get("config")),
);
```

#### `singleton<T>(id: ServiceIdentifier<T>, factory: (container: Container) => T): void`

Register a singleton service (cached instance).

```typescript
container.singleton("config", () => loadConfiguration());
container.singleton(
  "creditManager",
  (c) => new CreditManager(c.get("engines"), c.get("creditProvider")),
);
```

### Resolution Methods

#### `get<T>(id: ServiceIdentifier<T>): T`

Resolve a service instance.

```typescript
const config = container.get<Config>("config");
const manager = container.get<CreditManager>("creditManager");
```

### Utility Methods

#### `has(id: ServiceIdentifier): boolean`

Check if a service is registered.

```typescript
if (container.has("optionalService")) {
  const service = container.get("optionalService");
}
```

#### `unbind(id: ServiceIdentifier): boolean`

Remove a service binding.

```typescript
container.unbind("oldService");
```

#### `reset(): void`

Clear all service bindings (useful for testing).

```typescript
container.reset(); // Container is now empty
```

#### `getRegisteredServices(): ServiceIdentifier[]`

Get list of all registered service identifiers.

```typescript
const services = container.getRegisteredServices();
console.log("Available services:", services);
```

#### `getServiceInfo(id: ServiceIdentifier)`

Get service information including lifetime and factory details.

```typescript
const info = container.getServiceInfo("config");
console.log("Service lifetime:", info?.singleton ? "singleton" : "transient");
console.log("Cached:", info?.cached);
```

## Error Handling

The container provides comprehensive error handling:

### Missing Service Error

```typescript
container.get("unregistered-service");
// Error: No binding found for 'unregistered-service'. Registered services: [config, logger, ...]
```

### Circular Dependency Detection

```typescript
container.bind("A", (c) => c.get("B"));
container.bind("B", (c) => c.get("A"));
container.get("A");
// Error: Circular dependency detected: A -> B -> A
```

### Enhanced Factory Errors

```typescript
container.bind("failing-service", () => {
  throw new Error("Factory failed");
});
container.get("failing-service");
// Error: Failed to resolve service 'failing-service': Factory failed
```

## Usage Examples

### Basic Service Registration

```typescript
import { container } from "./core/container";

// Register configuration as singleton
container.singleton("config", () => loadConfig());

// Register logger as singleton
container.singleton("logger", () => new Logger());

// Register search strategy as transient
container.bind(
  "searchStrategy",
  (c) => new AllProvidersStrategy(c.get("config")),
);

// Use services
const config = container.get<Config>("config");
const logger = container.get<Logger>("logger");
const strategy = container.get<SearchStrategy>("searchStrategy");
```

### Complex Dependency Graph

```typescript
// Configuration layer
container.singleton("config", () => loadConfig());

// Data layer
container.singleton("creditProvider", () => new FileCreditStateProvider());

// Business logic layer
container.singleton(
  "creditManager",
  (c) => new CreditManager(c.get("config").engines, c.get("creditProvider")),
);

// Application layer
container.singleton(
  "orchestrator",
  (c) =>
    new UberSearchOrchestrator(
      c.get("config"),
      c.get("creditManager"),
      c.get("providerRegistry"),
    ),
);
```

### Testing with Container

```typescript
import { Container } from "./core/container";

describe("MyService", () => {
  let testContainer: Container;

  beforeEach(() => {
    testContainer = new Container();
    // Register test doubles
    testContainer.bind("mockProvider", () => new MockProvider());
  });

  afterEach(() => {
    testContainer.reset();
  });

  test("should work with mocked dependencies", () => {
    const service = testContainer.get("myService");
    expect(service.doSomething()).toBe("mocked-result");
  });
});
```

## Integration with Multi-Search

The container integrates seamlessly with the existing ubersearch architecture:

### Service Registration

```typescript
export function registerServices(): void {
  // Configuration
  container.singleton("config", async () => {
    const config = await loadConfig();
    return config;
  });

  // Credit management
  container.singleton(
    "creditStateProvider",
    () => new FileCreditStateProvider(),
  );

  container.singleton("creditManager", async (c) => {
    const config = await c.get("config");
    const provider = c.get("creditStateProvider");
    const manager = new CreditManager(config.engines, provider);
    await manager.initialize();
    return manager;
  });

  // Provider registry
  container.singleton("providerRegistry", (c) => {
    const registry = new ProviderRegistry();
    registry.register("brave", new BraveProvider());
    registry.register("tavily", new TavilyProvider());
    return registry;
  });

  // Main orchestrator
  container.singleton("orchestrator", async (c) => {
    const config = await c.get("config");
    const creditManager = await c.get("creditManager");
    const providerRegistry = c.get("providerRegistry");
    return new UberSearchOrchestrator(config, creditManager, providerRegistry);
  });
}
```

### Usage in Application

```typescript
// Register services at startup
registerServices();

// Get orchestrator from container
const orchestrator =
  await container.get<UberSearchOrchestrator>("orchestrator");

// Use normally
const results = await orchestrator.run("typescript DI container");
```

## Performance

The container is optimized for performance:

- **O(1) Lookups**: Uses `Map` for constant-time service resolution
- **Lazy Instantiation**: Services are created only when needed
- **Singleton Caching**: Cached instances avoid repeated factory calls
- **Minimal Overhead**: Simple factory pattern without reflection

Benchmark results (1000 service resolutions):

- Average time per resolution: ~0.001ms
- Resolutions per second: ~1,000,000

## Best Practices

### 1. Use Singletons for Shared State

```typescript
// ✅ Good - shared configuration
container.singleton('config', () => loadConfig());

// ✅ Good - shared credit manager
container.singleton('creditManager', (c) => new CreditManager(...));
```

### 2. Use Transients for Stateless Services

```typescript
// ✅ Good - stateless strategy
container.bind("searchStrategy", (c) => new AllProvidersStrategy());

// ✅ Good - new instance needed each time
container.bind("requestHandler", () => new RequestHandler());
```

### 3. Register Services at Startup

```typescript
// ✅ Good - register all services at application start
function bootstrap() {
  registerServices();
  const app = container.get<Application>("app");
  app.start();
}
```

### 4. Use Type Safety

```typescript
// ✅ Good - explicit typing
const config = container.get<SearchXngConfig>("config");
const manager = container.get<CreditManager>("creditManager");
```

### 5. Handle Registration Errors

```typescript
try {
  registerServices();
} catch (error) {
  console.error("Failed to register services:", error);
  process.exit(1);
}
```

## Migration from Manual Instantiation

### Before (Manual)

```typescript
const config = await loadConfig();
const provider = new FileCreditStateProvider();
const creditManager = new CreditManager(config.engines, provider);
await creditManager.initialize();
const registry = new ProviderRegistry();
registry.register("brave", new BraveProvider());
const orchestrator = new UberSearchOrchestrator(
  config,
  creditManager,
  registry,
);
```

### After (DI Container)

```typescript
registerServices();
const orchestrator =
  await container.get<UberSearchOrchestrator>("orchestrator");
```

## Testing

The container includes comprehensive tests covering:

- ✅ Basic registration and resolution
- ✅ Singleton vs transient behavior
- ✅ Circular dependency detection
- ✅ Error handling and messaging
- ✅ Service introspection
- ✅ Performance under load
- ✅ Real-world usage patterns

Run tests:

```bash
bun test src/core/container.test.ts
```

## Conclusion

The Dependency Injection Container provides a clean, testable architecture for the ubersearch project. It eliminates manual dependency management, supports both singleton and transient lifetimes, detects circular dependencies, and provides excellent error messages. The container is lightweight, performant, and fully integrated with the existing codebase.\n\nFor more examples, see `src/core/container-usage-example.ts`.
