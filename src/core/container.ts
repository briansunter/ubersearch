/**
 * Dependency Injection Container
 *
 * Central service locator that manages service registration and resolution.
 * Implements factory pattern with singleton and transient lifetimes.
 *
 * @module core/container
 */

/**
 * Service identifier - can be string or Symbol for unique identification
 */
export type ServiceIdentifier<_T = unknown> = string | symbol;

/**
 * Container binding configuration
 */
export interface ContainerBinding<T> {
  /** Factory function that creates service instance */
  factory: (container: Container) => T;
  /** Whether service should be singleton (cached) */
  singleton: boolean;
  /** Cached instance for singleton services */
  cached?: T;
}

/**
 * Dependency Injection Container
 *
 * Manages service registration and resolution with support for:
 * - Singleton and transient lifetimes
 * - Circular dependency detection
 * - Type-safe resolution
 * - Factory pattern for lazy instantiation
 *
 * @example
 * ```typescript
 * const container = new Container();
 *
 * // Register singleton service
 * container.singleton('config', () => loadConfig());
 *
 * // Register transient service
 * container.bind('strategy', (c) => new SearchStrategy(c.get('config')));
 *
 * // Resolve service
 * const config = container.get<Config>('config');
 * ```
 */
export class Container {
  /** Internal storage for service bindings */
  private bindings = new Map<ServiceIdentifier, ContainerBinding<unknown>>();

  /** Stack to detect circular dependencies during resolution */
  private resolutionStack = new Set<ServiceIdentifier>();

  /**
   * Register a transient service (new instance each time)
   *
   * @param id - Service identifier
   * @param factory - Factory function that creates the service
   * @template T - Service type
   *
   * @example
   * ```typescript
   * container.bind('searchStrategy', (c) => new AllProvidersStrategy());
   * ```
   */
  bind<T>(id: ServiceIdentifier<T>, factory: (container: Container) => T): void {
    this.bindings.set(id, {
      factory,
      singleton: false,
    });
  }

  /**
   * Register a singleton service (cached instance)
   *
   * @param id - Service identifier
   * @param factory - Factory function that creates the service
   * @template T - Service type
   *
   * @example
   * ```typescript
   * container.singleton('config', () => loadConfiguration());
   * container.singleton('creditManager', (c) => new CreditManager(
   *   c.get('engines'),
   *   c.get('creditProvider')
   * ));
   * ```
   */
  singleton<T>(id: ServiceIdentifier<T>, factory: (container: Container) => T): void {
    this.bindings.set(id, {
      factory,
      singleton: true,
    });
  }

  /**
   * Resolve a service instance
   *
   * @param id - Service identifier
   * @returns Service instance
   * @template T - Service type
   * @throws {Error} If service is not registered or circular dependency detected
   *
   * @example
   * ```typescript
   * const config = container.get<Config>('config');
   * const manager = container.get<CreditManager>('creditManager');
   * ```
   */
  get<T>(id: ServiceIdentifier<T>): T {
    // Check for circular dependency
    if (this.resolutionStack.has(id)) {
      const chain = [...this.resolutionStack, id].map(String).join(" -> ");
      throw new Error(`Circular dependency detected: ${chain}`);
    }

    const binding = this.bindings.get(id);
    if (!binding) {
      const registered = Array.from(this.bindings.keys()).map(String);
      throw new Error(
        `No binding found for '${String(id)}'. Registered services: [${registered.join(", ")}]`,
      );
    }

    // Handle singleton caching
    if (binding.singleton && binding.cached !== undefined) {
      return binding.cached as T;
    }

    // Track resolution for circular dependency detection
    this.resolutionStack.add(id);

    try {
      // Create instance using factory
      const instance = binding.factory(this);

      // Guard against async factories — the container is synchronous. Any async
      // initialization must happen post-construction (e.g. the way bootstrapContainer
      // initializes CreditManager after container.get() returns).
      if (
        instance !== null &&
        typeof instance === "object" &&
        typeof (instance as { then?: unknown }).then === "function"
      ) {
        throw new Error(
          `Service '${String(id)}' factory returned a Promise. The container is synchronous; ` +
            "perform async initialization post-construction (see bootstrapContainer pattern).",
        );
      }

      // Cache singleton instances
      if (binding.singleton) {
        binding.cached = instance;
      }

      return instance as T;
    } catch (error) {
      // Enhance error message with context
      if (error instanceof Error) {
        throw new Error(`Failed to resolve service '${String(id)}': ${error.message}`);
      }
      throw error;
    } finally {
      // Clean up resolution stack
      this.resolutionStack.delete(id);
    }
  }

  /**
   * Check if a service is registered
   *
   * @param id - Service identifier
   * @returns true if service is registered
   *
   * @example
   * ```typescript
   * if (container.has('optionalService')) {
   *   const service = container.get('optionalService');
   * }
   * ```
   */
  has(id: ServiceIdentifier): boolean {
    return this.bindings.has(id);
  }

  /**
   * Remove a service binding
   *
   * @param id - Service identifier to remove
   * @returns true if binding was removed, false if it didn't exist
   *
   * @example
   * ```typescript
   * container.unbind('oldService');
   * ```
   */
  unbind(id: ServiceIdentifier): boolean {
    return this.bindings.delete(id);
  }

  /**
   * Clear all service bindings
   * Useful for testing or resetting container state
   *
   * @example
   * ```typescript
   * container.reset();
   * // Container is now empty
   * ```
   */
  reset(): void {
    this.bindings.clear();
    this.resolutionStack.clear();
  }

  /**
   * Get list of all registered service identifiers
   *
   * @returns Array of service identifiers
   *
   * @example
   * ```typescript
   * const services = container.getRegisteredServices();
   * console.log('Available services:', services);
   * ```
   */
  getRegisteredServices(): ServiceIdentifier[] {
    return Array.from(this.bindings.keys());
  }

  /**
   * Get service information including lifetime and factory details
   * Useful for debugging and introspection
   *
   * @param id - Service identifier
   * @returns Service information or undefined if not found
   *
   * @example
   * ```typescript
   * const info = container.getServiceInfo('config');
   * console.log('Service lifetime:', info?.singleton ? 'singleton' : 'transient');
   * ```
   */
  getServiceInfo(id: ServiceIdentifier):
    | {
        singleton: boolean;
        cached: boolean;
        factory: (container: Container) => unknown;
      }
    | undefined {
    const binding = this.bindings.get(id);
    if (!binding) {
      return undefined;
    }

    return {
      singleton: binding.singleton,
      cached: binding.cached !== undefined,
      factory: binding.factory,
    };
  }
}

/**
 * Global container instance for convenience
 * Use this for application-wide dependency injection
 *
 * @example
 * ```typescript
 * import { container } from './core/container';
 *
 * // Register services globally
 * container.singleton('config', () => loadConfig());
 *
 * // Use in any module
 * const config = container.get<Config>('config');
 * ```
 */
export const container = new Container();
