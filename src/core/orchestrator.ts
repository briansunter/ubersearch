/**
 * Multi-Search Orchestrator
 *
 * Coordinates multiple search providers and implements different search strategies
 */

import type { AiSearchConfig } from "../config/types";
import type { CreditManager, CreditSnapshot } from "./credits";
import type { ProviderRegistry } from "./provider";
import type { StrategyContext } from "./strategy/ISearchStrategy";
import { StrategyFactory } from "./strategy/StrategyFactory";
import type { EngineId, SearchResultItem } from "./types";

export interface AiSearchOptions {
  /** Override the default engine order */
  engineOrderOverride?: EngineId[];

  /** Maximum results per provider */
  limit?: number;

  /** Include raw provider responses */
  includeRaw?: boolean;

  /** Search strategy */
  strategy?: "all" | "first-success";
}

export interface EngineAttempt {
  engineId: EngineId;
  success: boolean;
  reason?: string;
}

export interface OrchestratorResult {
  /** Original query */
  query: string;

  /** Combined results from all successful providers */
  results: SearchResultItem[];

  /** Metadata about engine attempts */
  engineAttempts: EngineAttempt[];

  /** Credit snapshots after the search */
  credits: CreditSnapshot[];
}

export class AiSearchOrchestrator {
  constructor(
    private config: AiSearchConfig,
    private credits: CreditManager,
    private registry: ProviderRegistry,
  ) {}

  /**
   * Determine the engine order to use for this search
   */
  private getEngineOrder(override?: EngineId[]): EngineId[] {
    if (override?.length) {
      return override;
    }
    return this.config.defaultEngineOrder;
  }

  /**
   * Run a ai-search with the specified options
   */
  async run(query: string, options: AiSearchOptions = {}): Promise<OrchestratorResult> {
    const order = this.getEngineOrder(options.engineOrderOverride);
    const strategyName = options.strategy ?? "all";

    if (order.length === 0) {
      throw new Error("No engines configured or selected");
    }

    // Create strategy using factory
    const strategy = StrategyFactory.createStrategy(strategyName);

    // Create strategy context
    const context: StrategyContext = {
      creditManager: this.credits,
      providerRegistry: this.registry,
    };

    // Execute strategy
    const { results, attempts } = await strategy.execute(query, order, options, context);

    // For 'all' strategy, sort results by score (descending)
    if (strategyName === "all") {
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    // Get credit snapshots
    const credits = this.credits.listSnapshots();

    return {
      query,
      results,
      engineAttempts: attempts,
      credits,
    };
  }
}
