/**
 * Search Strategy Interface
 *
 * Defines the contract for all search strategies, enabling the Strategy pattern
 * for different search execution approaches (all engines, first success, etc.)
 */

import type { CreditManager } from "../credits";
import type { ProviderRegistry } from "../provider";
import type { EngineId, SearchResultItem } from "../types";

/**
 * Context object providing dependencies to search strategies
 */
export interface StrategyContext {
  /** Registry of available search providers */
  providerRegistry: ProviderRegistry;

  /** Credit manager for tracking usage across providers */
  creditManager: CreditManager;
}

/**
 * Options for configuring search strategy behavior
 */
export interface UberSearchOptions {
  /** Override the default engine order */
  engineOrderOverride?: EngineId[];

  /** Maximum results per provider */
  limit?: number;

  /** Include raw provider responses */
  includeRaw?: boolean;

  /** Search strategy */
  strategy?: "all" | "first-success";

  /**
   * Execute searches in parallel (only applies to 'all' strategy)
   * When true, all providers are queried simultaneously using Promise.allSettled
   * When false (default), providers are queried sequentially
   */
  parallel?: boolean;
}

/**
 * Metadata about a single engine attempt
 */
export interface EngineAttempt {
  /** Engine ID that was attempted */
  engineId: EngineId;

  /** Whether the attempt succeeded */
  success: boolean;

  /** Reason for failure (if success=false) */
  reason?: string;
}

/**
 * Result from executing a search strategy
 */
export interface StrategyResult {
  /** Combined results from all successful providers */
  results: SearchResultItem[];

  /** Metadata about which engines were tried and their outcomes */
  attempts: EngineAttempt[];
}

/**
 * Interface for implementing different search execution strategies
 *
 * This enables the Strategy pattern, allowing different approaches to
 * coordinate multiple search providers while maintaining a consistent interface.
 */
export interface ISearchStrategy {
  /**
   * Execute the search strategy with the given parameters
   *
   * @param query - The search query string
   * @param engineIds - Ordered list of engine IDs to attempt
   * @param options - Strategy configuration options
   * @param context - Dependencies and services needed for execution
   * @returns Promise resolving to strategy execution results
   */
  execute(
    query: string,
    engineIds: EngineId[],
    options: UberSearchOptions,
    context: StrategyContext,
  ): Promise<StrategyResult>;
}
