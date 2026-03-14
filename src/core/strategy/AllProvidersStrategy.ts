/**
 * AllProvidersStrategy - Queries all available providers and combines their results
 *
 * This strategy executes search queries against all configured providers,
 * collecting results from all successful providers. Supports both sequential
 * and parallel execution modes. Failed providers are logged but don't stop
 * the overall search.
 */

import { getErrorMessage } from "../errorUtils";
import { createLogger } from "../logger";
import type { SearchProvider } from "../provider";
import { withRetry } from "../retry";
import type { EngineId, SearchResponse, SearchResultItem } from "../types";
import { SearchError } from "../types";
import type {
  EngineAttempt,
  ISearchStrategy,
  StrategyContext,
  StrategyResult,
  UberSearchOptions,
} from "./ISearchStrategy";

const log = createLogger("AllProviders");

/**
 * Result from a single engine search attempt
 */
interface EngineSearchResult {
  engineId: EngineId;
  response?: SearchResponse;
  error?: unknown;
}

/**
 * Strategy implementation that queries all providers and combines results
 *
 * Supports two execution modes:
 * - Sequential (default): Providers are queried one at a time
 * - Parallel: All providers are queried simultaneously using Promise.allSettled
 */
export class AllProvidersStrategy implements ISearchStrategy {
  /**
   * Execute search against all providers and combine results
   *
   * @param query - The search query string
   * @param engineIds - Ordered list of engine IDs to search
   * @param options - Search options (limit, includeRaw, parallel, etc.)
   * @param context - Strategy context with registry and credits
   * @returns Combined results from all successful providers with attempt metadata
   */
  async execute(
    query: string,
    engineIds: EngineId[],
    options: UberSearchOptions,
    context: StrategyContext,
  ): Promise<StrategyResult> {
    // Choose execution mode based on options
    if (options.parallel) {
      return this.executeParallel(query, engineIds, options, context);
    }
    return this.executeSequential(query, engineIds, options, context);
  }

  /**
   * Execute searches sequentially (original behavior)
   */
  private async executeSequential(
    query: string,
    engineIds: EngineId[],
    options: UberSearchOptions,
    context: StrategyContext,
  ): Promise<StrategyResult> {
    const results: SearchResultItem[] = [];
    const attempts: EngineAttempt[] = [];

    // Query each engine sequentially
    for (const engineId of engineIds) {
      const provider = context.providerRegistry.get(engineId);
      if (!provider) {
        attempts.push({ engineId, success: false, reason: "no_provider" });
        continue;
      }

      // Charge credits before search (atomic check+deduct to avoid race conditions)
      if (!context.creditManager.charge(engineId)) {
        attempts.push({ engineId, success: false, reason: "out_of_credit" });
        continue;
      }

      try {
        // Execute search with retry logic for transient failures
        const response = await withRetry(engineId, () =>
          provider.search({
            query,
            limit: options.limit,
            includeRaw: options.includeRaw,
            categories: options.categories,
          }),
        );

        // Record success
        attempts.push({ engineId, success: true });

        results.push(...response.items);
      } catch (error) {
        // Refund credits for failed search
        context.creditManager.refund(engineId);

        // Record failure
        if (error instanceof SearchError) {
          attempts.push({ engineId, success: false, reason: error.reason });
        } else {
          attempts.push({ engineId, success: false, reason: "unknown" });
        }

        // Log debug message but continue with other providers
        log.debug(`Search failed for ${engineId}: ${getErrorMessage(error)}`);
      }
    }

    return { results: this.finalizeResults(results, options), attempts };
  }

  /**
   * Execute searches in parallel using Promise.allSettled
   *
   * This provides faster execution when querying multiple providers,
   * as all requests are made simultaneously.
   */
  private async executeParallel(
    query: string,
    engineIds: EngineId[],
    options: UberSearchOptions,
    context: StrategyContext,
  ): Promise<StrategyResult> {
    const results: SearchResultItem[] = [];
    const attempts: EngineAttempt[] = [];

    // Filter engines that are available and have credits
    const eligibleEngines: { engineId: EngineId; provider: SearchProvider }[] = [];
    const ineligibleAttempts: EngineAttempt[] = [];

    for (const engineId of engineIds) {
      const provider = context.providerRegistry.get(engineId);
      if (!provider) {
        ineligibleAttempts.push({ engineId, success: false, reason: "no_provider" });
        continue;
      }

      // Charge credits before search (atomic check+deduct to avoid race conditions)
      if (!context.creditManager.charge(engineId)) {
        ineligibleAttempts.push({ engineId, success: false, reason: "out_of_credit" });
        continue;
      }

      eligibleEngines.push({ engineId, provider });
    }

    // Execute all eligible searches in parallel with retry logic
    const searchPromises = eligibleEngines.map(
      async ({ engineId, provider }): Promise<EngineSearchResult> => {
        try {
          const response = await withRetry(engineId, () =>
            provider.search({
              query,
              limit: options.limit,
              includeRaw: options.includeRaw,
              categories: options.categories,
            }),
          );
          return { engineId, response };
        } catch (error) {
          return { engineId, error };
        }
      },
    );

    // Wait for all searches to complete
    const searchResults = await Promise.allSettled(searchPromises);

    // Process results in original order (maintain engine priority)
    for (let i = 0; i < searchResults.length; i++) {
      const settledResult = searchResults[i];
      const eligibleEngine = eligibleEngines[i];

      // Safety check (should always exist, but TypeScript needs this)
      if (!settledResult || !eligibleEngine) {
        continue;
      }

      const { engineId } = eligibleEngine;

      if (settledResult.status === "rejected") {
        // Promise itself was rejected (shouldn't happen with our try/catch, but handle it)
        context.creditManager.refund(engineId);
        const error = settledResult.reason;
        if (error instanceof SearchError) {
          attempts.push({ engineId, success: false, reason: error.reason });
        } else {
          attempts.push({ engineId, success: false, reason: "unknown" });
        }
        log.debug(`Search failed for ${engineId}: Promise rejected`);
        continue;
      }

      if ("error" in settledResult.value) {
        // Refund credits for failed search
        context.creditManager.refund(engineId);

        // Search threw an error
        const error = settledResult.value.error;
        if (error instanceof SearchError) {
          attempts.push({ engineId, success: false, reason: error.reason });
        } else {
          attempts.push({ engineId, success: false, reason: "unknown" });
        }
        log.debug(`Search failed for ${engineId}: ${getErrorMessage(error)}`);
        continue;
      }

      const { response } = settledResult.value;

      if (response) {
        // Record success
        attempts.push({ engineId, success: true });

        // Add results
        results.push(...response.items);
      }
    }

    // Add ineligible attempts at the end (maintaining order within their category)
    attempts.push(...ineligibleAttempts);

    // Sort attempts to match original engine order
    const engineOrder = new Map(engineIds.map((id, idx) => [id, idx]));
    attempts.sort(
      (a, b) => (engineOrder.get(a.engineId) ?? 0) - (engineOrder.get(b.engineId) ?? 0),
    );

    return { results: this.finalizeResults(results, options), attempts };
  }

  /**
   * Deduplicate results by URL, sort by score, and apply limit.
   */
  private finalizeResults(
    results: SearchResultItem[],
    options: UberSearchOptions,
  ): SearchResultItem[] {
    const seen = new Set<string>();
    const deduped: SearchResultItem[] = [];
    for (const item of results) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        deduped.push(item);
      }
    }

    deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    if (options.limit !== undefined && deduped.length > options.limit) {
      deduped.splice(options.limit);
    }

    return deduped;
  }
}
