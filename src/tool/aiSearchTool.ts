/**
 * Main ai-search tool function
 *
 * This is the single public interface that orchestrates the entire search process
 */

import { bootstrapContainer } from "../bootstrap/container";
import type { CreditManager } from "../core/credits";
import type { AiSearchOrchestrator } from "../core/orchestrator";
import { ServiceKeys } from "../core/serviceKeys";
import type { AiSearchInput, AiSearchOutput } from "./interface";

/**
 * Options for multiSearch function
 */
export interface AiSearchOptions {
  /** Explicit config file path */
  configPath?: string;
  /** Container override for testing (dependency injection) */
  containerOverride?: {
    get<T>(serviceId: string): T;
  };
}

/**
 * Execute a ai-search across configured providers
 *
 * This function:
 * 1. Bootstraps the DI container (or uses provided override)
 * 2. Resolves orchestrator from container
 * 3. Executes search with chosen strategy
 * 4. Returns normalized results
 *
 * @param input Search input parameters
 * @param options Optional config path or options object
 * @returns Search results with metadata
 */
export async function multiSearch(
  input: AiSearchInput,
  options?: string | AiSearchOptions,
): Promise<AiSearchOutput> {
  // Handle backwards compatibility: string arg is config path
  const opts: AiSearchOptions =
    typeof options === "string" ? { configPath: options } : (options ?? {});

  // Bootstrap the DI container or use override
  const container = opts.containerOverride ?? (await bootstrapContainer(opts.configPath));

  // Resolve orchestrator from container
  const orchestrator = container.get<AiSearchOrchestrator>(ServiceKeys.ORCHESTRATOR);

  // Execute search
  const result = await orchestrator.run(input.query, {
    limit: input.limit,
    engineOrderOverride: input.engines,
    includeRaw: input.includeRaw,
    strategy: input.strategy ?? "all",
  });

  // Format output
  return {
    query: result.query,
    items: result.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      score: r.score,
      sourceEngine: r.sourceEngine,
    })),
    enginesTried: result.engineAttempts.map((a) => ({
      engineId: a.engineId,
      success: a.success,
      reason: a.reason,
    })),
    credits: result.credits,
  };
}

/**
 * Options for getCreditStatus function
 */
export interface GetCreditStatusOptions {
  /** Explicit config file path */
  configPath?: string;
  /** Container override for testing (dependency injection) */
  containerOverride?: {
    get<T>(serviceId: string): T;
  };
}

/**
 * Get current credit status for all engines
 *
 * Useful for checking credit availability before searching
 *
 * @param options Optional config path (string) or options object
 */
export async function getCreditStatus(
  options?: string | GetCreditStatusOptions,
): Promise<AiSearchOutput["credits"]> {
  // Handle backwards compatibility: string arg is config path
  const opts: GetCreditStatusOptions =
    typeof options === "string" ? { configPath: options } : (options ?? {});

  // Bootstrap the DI container or use override
  const container = opts.containerOverride ?? (await bootstrapContainer(opts.configPath));
  const creditManager = container.get<CreditManager>(ServiceKeys.CREDIT_MANAGER);

  return creditManager.listSnapshots();
}
