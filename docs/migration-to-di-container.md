# Migration Guide: Manual Instantiation to DI Container

This guide helps you migrate the ubersearch codebase from manual instantiation to using the Dependency Injection Container.

## Current State Analysis

Looking at the existing codebase, here are the main areas that need migration:

### 1. Manual Instantiation in CLI (`src/cli.ts`)

**Current Pattern:**

```typescript
const config = await loadConfig();
const provider = new FileCreditStateProvider();
const creditManager = new CreditManager(config.engines, provider);
await creditManager.initialize();
const registry = new ProviderRegistry();
// ... register providers manually
const orchestrator = new UberSearchOrchestrator(
  config,
  creditManager,
  registry,
);
```

### 2. Provider Registration

**Current Pattern:**

```typescript
registry.register("brave", new BraveProvider());
registry.register("tavily", new TavilyProvider());
// ... manual registration for each provider
```

### 3. Strategy Creation

**Current Pattern:**

```typescript
const strategy = StrategyFactory.createStrategy("all", registry);
```

## Migration Steps

### Step 1: Create Service Registration Function

Create `src/bootstrap/services.ts`:

```typescript
import { container } from "../core/container";
import { loadConfig } from "../config/load";
import { UberSearchOrchestrator } from "../core/orchestrator";
import { CreditManager } from "../core/credits/CreditManager";
import { FileCreditStateProvider } from "../core/credits/FileCreditStateProvider";
import { ProviderRegistry } from "../core/provider";
import { StrategyFactory } from "../core/strategy/StrategyFactory";

// Import all providers
import { BraveProvider } from "../providers/brave";
import { TavilyProvider } from "../providers/tavily";
import { LinkupProvider } from "../providers/linkup";
import { SearchXngProvider } from "../providers/searchxng";

/**
 * Register all application services in the DI container
 */
export async function registerServices(): Promise<void> {
  // Configuration - singleton
  container.singleton("config", async () => {
    const config = await loadConfig();
    return config;
  });

  // Credit State Provider - singleton
  container.singleton(
    "creditStateProvider",
    () => new FileCreditStateProvider(),
  );

  // Credit Manager - singleton (with async initialization)
  container.singleton("creditManager", async (c) => {
    const config = await c.get("config");
    const provider = c.get("creditStateProvider");
    const manager = new CreditManager(config.engines, provider);
    await manager.initialize();
    return manager;
  });

  // Provider Registry - singleton
  container.singleton("providerRegistry", () => {
    const registry = new ProviderRegistry();

    // Register all providers
    registry.register("brave", new BraveProvider());
    registry.register("tavily", new TavilyProvider());
    registry.register("linkup", new LinkupProvider());
    registry.register("searchxng", new SearchXngProvider());

    return registry;
  });

  // Strategy Factory - singleton
  container.singleton("strategyFactory", (c) => {
    const registry = c.get("providerRegistry");
    return new StrategyFactory(registry);
  });

  // Main Orchestrator - singleton
  container.singleton("orchestrator", async (c) => {
    const config = await c.get("config");
    const creditManager = await c.get("creditManager");
    const providerRegistry = c.get("providerRegistry");

    return new UberSearchOrchestrator(config, creditManager, providerRegistry);
  });
}
```

### Step 2: Update CLI Entry Point

Update `src/cli.ts`:

```typescript
import { container } from "./core/container";
import { registerServices } from "./bootstrap/services";

async function main() {
  try {
    // Register all services
    await registerServices();

    // Get orchestrator from container instead of manual instantiation
    const orchestrator =
      await container.get<UberSearchOrchestrator>("orchestrator");

    // Use orchestrator normally
    const results = await orchestrator.run(query, options);

    // ... rest of CLI logic
  } catch (error) {
    console.error("Search failed:", error);
    process.exit(1);
  }
}
```

### Step 3: Update Tool Interface

Update `src/tool/interface.ts` to use DI container:

```typescript
import { container } from "../core/container";

export async function createUberSearchTool() {
  // Ensure services are registered
  if (!container.has("orchestrator")) {
    const { registerServices } = await import("../bootstrap/services");
    await registerServices();
  }

  const orchestrator =
    await container.get<UberSearchOrchestrator>("orchestrator");

  return {
    name: "multi_search",
    description: "Search across multiple providers",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        strategy: { type: "string", enum: ["all", "first-success"] },
      },
      required: ["query"],
    },
    execute: async (args: any) => {
      const results = await orchestrator.run(args.query, {
        limit: args.limit,
        strategy: args.strategy,
      });
      return results;
    },
  };
}
```

### Step 4: Update Bootstrap Process

Create `src/bootstrap/index.ts`:

```typescript
export { registerServices } from "./services";
export { initializeProviders } from "./providers";
```

Update `src/bootstrap/providers.ts` to use container:

```typescript
import { container } from "../core/container";

export async function initializeProviders(): Promise<void> {
  const registry = container.get<ProviderRegistry>("providerRegistry");

  // Any additional provider initialization logic
  console.log(`Initialized ${registry.list().length} providers`);
}
```

### Step 5: Handle Async Initialization

For services that require async initialization (like CreditManager), create a helper:

```typescript
// src/bootstrap/initialization.ts
export async function initializeApplication(): Promise<void> {
  // Register services
  await registerServices();

  // Initialize async services
  const creditManager = await container.get<CreditManager>("creditManager");
  console.log("Credit manager initialized");

  const orchestrator =
    await container.get<UberSearchOrchestrator>("orchestrator");
  console.log("Orchestrator ready");
}
```

## Migration Checklist

### Phase 1: Core Services

- [ ] Create `src/bootstrap/services.ts` with service registration
- [ ] Update `src/cli.ts` to use container
- [ ] Update `src/tool/interface.ts` to use container
- [ ] Test basic functionality

### Phase 2: Provider Integration

- [ ] Ensure all providers are registered in container
- [ ] Update provider-specific initialization
- [ ] Test with different provider combinations

### Phase 3: Testing

- [ ] Update unit tests to use test container
- [ ] Add integration tests for service registration
- [ ] Test error scenarios (missing services, circular deps)

### Phase 4: Documentation

- [ ] Update README with DI container usage
- [ ] Document service registration patterns
- [ ] Add troubleshooting guide

## Common Migration Patterns

### Pattern 1: Simple Service Registration

**Before:**

```typescript
const service = new MyService();
```

**After:**

```typescript
container.singleton("myService", () => new MyService());
const service = container.get<MyService>("myService");
```

### Pattern 2: Service with Dependencies

**Before:**

```typescript
const config = loadConfig();
const service = new MyService(config);
```

**After:**

```typescript
container.singleton("config", () => loadConfig());
container.singleton("myService", (c) => new MyService(c.get("config")));
```

### Pattern 3: Async Service Initialization

**Before:**

```typescript
const service = new MyService();
await service.initialize();
```

**After:**

```typescript
container.singleton("myService", async (c) => {
  const service = new MyService();
  await service.initialize();
  return service;
});
```

## Testing Migration

### Unit Tests

Update tests to use a fresh container instance:

```typescript
import { Container } from "../core/container";

describe("MyService", () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  test("should work with DI", () => {
    container.bind("dependency", () => new MockDependency());
    container.bind("service", (c) => new MyService(c.get("dependency")));

    const service = container.get<MyService>("service");
    expect(service.doSomething()).toBe("expected");
  });
});
```

### Integration Tests

Test the complete service registration:

```typescript
describe("Service Registration", () => {
  test("should register all services", async () => {
    await registerServices();

    expect(container.has("config")).toBe(true);
    expect(container.has("creditManager")).toBe(true);
    expect(container.has("orchestrator")).toBe(true);

    // Test service resolution
    const orchestrator =
      await container.get<UberSearchOrchestrator>("orchestrator");
    expect(orchestrator).toBeInstanceOf(UberSearchOrchestrator);
  });
});
```

## Troubleshooting

### Issue: Services not found

**Error:** `No binding found for 'service-name'`

**Solution:**

1. Ensure `registerServices()` is called before using services
2. Check service name spelling
3. Use `container.getRegisteredServices()` to list available services

### Issue: Circular dependencies

**Error:** `Circular dependency detected: A -> B -> A`

**Solution:**

1. Review service dependencies
2. Consider using events or interfaces to break cycles
3. Use factory functions to defer resolution

### Issue: Async initialization problems

**Error:** Service not fully initialized

**Solution:**

1. Use async factory functions in container
2. Ensure proper await when getting async services
3. Create initialization helper functions

### Issue: Performance concerns

**Observation:** Service resolution seems slow

**Solution:**

1. Use singletons for expensive-to-create services
2. Profile with `container.getServiceInfo()` to check caching
3. Consider lazy initialization patterns

## Verification

After migration, verify the following:

1. **All services resolve correctly:**

   ```typescript
   const services = ["config", "creditManager", "orchestrator"];
   for (const service of services) {
     expect(container.has(service)).toBe(true);
   }
   ```

2. **No circular dependencies:**

   ```typescript
   // Should not throw
   await container.get<UberSearchOrchestrator>("orchestrator");
   ```

3. **Services maintain correct lifetime:**

   ```typescript
   const service1 = container.get<MyService>("singletonService");
   const service2 = container.get<MyService>("singletonService");
   expect(service1).toBe(service2); // Same instance
   ```

4. **Error messages are helpful:**

   ```typescript
   expect(() => container.get("nonexistent")).toThrow(
     /No binding found for 'nonexistent'/,
   );
   ```

## Benefits After Migration

### ✅ Improved Testability

- Easy to mock dependencies
- Test container isolation
- Service substitution

### ✅ Better Separation of Concerns

- Service registration centralized
- Business logic separated from instantiation
- Clear dependency graph

### ✅ Enhanced Flexibility

- Easy to swap implementations
- Configuration-driven service selection
- Plugin architecture support

### ✅ Reduced Boilerplate

- No more manual dependency passing
- Automatic service resolution
- Cleaner initialization code

## Next Steps

After completing the migration:

1. **Remove old manual instantiation code**
2. **Update documentation with new patterns**
3. **Add more comprehensive DI tests**
4. **Consider adding service decorators**
5. **Implement service configuration validation**

The migration to DI container will result in a cleaner, more maintainable, and more testable codebase.\n\nFor additional support, see the main [DI Container documentation](./container.md).
