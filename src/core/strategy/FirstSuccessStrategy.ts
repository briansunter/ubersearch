/**
 * First Success Strategy - stops after first successful provider
 *
 * This strategy tries search providers in order and returns immediately
 * with results from the first successful provider. It skips providers
 * with insufficient credits and stops execution after the first success.
 */

import { createLogger } from "../logger";
import type { EngineId } from "../types";
import { SearchError } from "../types";
import type {
  EngineAttempt,
  ISearchStrategy,
  AiSearchOptions,
  StrategyContext,
  StrategyResult,
} from "./ISearchStrategy";

const log = createLogger("FirstSuccess");

/**
 * First Success Strategy implementation
 *
 * Tries engines in order until first success, then returns immediately.
 * Records all attempts up to and including the first successful one.
 * Skips providers with insufficient credits.
 */
export class FirstSuccessStrategy implements ISearchStrategy {
  /**
   * Execute search with first-success strategy
   *
   * @param query - The search query string
   * @param engineIds - Ordered list of engine IDs to try
   * @param options - Search options (limit, includeRaw, etc.)
   * @param context - Strategy context with registry and credits
   * @returns Promise resolving to strategy result with first successful results
   */
  async execute(
    query: string,
    engineIds: EngineId[],
    options: AiSearchOptions,
    context: StrategyContext,
  ): Promise<StrategyResult> {
    const attempts: EngineAttempt[] = [];

    // Try each engine in order until one succeeds
    for (const engineId of engineIds) {
      const provider = context.providerRegistry.get(engineId);
      if (!provider) {
        attempts.push({ engineId, success: false, reason: "no_provider" });
        continue;
      }

      // Check credit availability
      if (!context.creditManager.hasSufficientCredits(engineId)) {
        attempts.push({ engineId, success: false, reason: "out_of_credit" });
        continue;
      }

      try {
        // Execute search
        const response = await provider.search({
          query,
          limit: options.limit,
          includeRaw: options.includeRaw,
        });

        // Deduct credits
        if (!context.creditManager.charge(engineId)) {
          attempts.push({ engineId, success: false, reason: "out_of_credit" });
          continue;
        }

        // Record success
        attempts.push({ engineId, success: true });

        // Return immediately with results from this provider
        return { results: response.items, attempts };
      } catch (error) {
        // Record failure and continue to next provider
        if (error instanceof SearchError) {
          attempts.push({ engineId, success: false, reason: error.reason });
        } else {
          attempts.push({ engineId, success: false, reason: "unknown" });
        }

        // Log warning and continue
        log.warn(
          `Search failed for ${engineId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // No provider succeeded
    return { results: [], attempts };
  }
}
