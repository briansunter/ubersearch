/**
 * Service Keys for Dependency Injection Container
 *
 * Centralized constants for all service identifiers used with the DI container.
 * Using constants instead of magic strings prevents typos and enables IDE support.
 *
 * @example
 * ```typescript
 * import { ServiceKeys } from '../core/serviceKeys';
 *
 * // Register service
 * container.singleton(ServiceKeys.CONFIG, () => config);
 *
 * // Resolve service
 * const config = container.get<UberSearchConfig>(ServiceKeys.CONFIG);
 * ```
 */

/**
 * All service keys used in the DI container
 */
export const ServiceKeys = {
  /** Application configuration */
  CONFIG: "config",

  /** Credit state persistence provider */
  CREDIT_STATE_PROVIDER: "creditStateProvider",

  /** Credit manager for tracking usage */
  CREDIT_MANAGER: "creditManager",

  /** Registry of all search providers */
  PROVIDER_REGISTRY: "providerRegistry",

  /** Factory for creating search strategies */
  STRATEGY_FACTORY: "strategyFactory",

  /** Main search orchestrator */
  ORCHESTRATOR: "orchestrator",
} as const;

/**
 * Type representing any valid service key
 */
export type ServiceKey = (typeof ServiceKeys)[keyof typeof ServiceKeys];
