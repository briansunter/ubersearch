/**
 * UberSearch Orchestrator
 *
 * Coordinates multiple search providers and implements different search strategies
 */

import type { UberSearchConfig } from "../config/types";
import type { CreditManager, CreditSnapshot } from "./credits";
import type { ProviderRegistry } from "./provider";
import type { EngineAttempt, StrategyContext, UberSearchOptions } from "./strategy/ISearchStrategy";
import { StrategyFactory } from "./strategy/StrategyFactory";
import type { EngineId, SearchResultItem } from "./types";

export type { UberSearchOptions, EngineAttempt };

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

export class UberSearchOrchestrator {
  constructor(
    private config: UberSearchConfig,
    private credits: CreditManager,
    private registry: ProviderRegistry,
  ) {}

  /**
   * Determine the engine order to use for this search
   * Only includes engines that are actually registered in the provider registry
   */
  private getEngineOrder(override?: EngineId[]): EngineId[] {
    const baseOrder = override?.length ? override : this.config.defaultEngineOrder;

    // Filter to only include engines that are registered (have valid providers)
    return baseOrder.filter((engineId) => this.registry.get(engineId) !== undefined);
  }

  /**
   * Run a ubersearch with the specified options
   */
  async run(query: string, options: UberSearchOptions = {}): Promise<OrchestratorResult> {
    const order = this.getEngineOrder(options.engineOrderOverride);
    const strategyName = options.strategy ?? "first-success";

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
