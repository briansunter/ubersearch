/**
 * Credit management system for tracking usage across providers
 * Refactored to use dependency injection - no file I/O dependencies
 */

import type { EngineConfig } from "../../config/types";
import type { EngineId } from "../types";
import type { CreditState, CreditStateProvider } from "./CreditStateProvider";

export interface CreditSnapshot {
  engineId: EngineId;
  quota: number;
  used: number;
  remaining: number;
  isExhausted: boolean;
}

export class CreditManager {
  private engines: Map<EngineId, EngineConfig>;
  private state: CreditState = {};

  constructor(
    engines: EngineConfig[],
    private stateProvider: CreditStateProvider,
  ) {
    this.engines = new Map(engines.map((e) => [e.id, e]));
  }

  /**
   * Initialize the credit manager by loading state from provider
   * Must be called after construction
   */
  async initialize(): Promise<void> {
    this.state = await this.stateProvider.loadState();
    await this.resetIfNeeded();
  }

  /**
   * Check if we need to reset monthly usage (first day of month)
   */
  private async resetIfNeeded(): Promise<void> {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

    for (const [engineId, _config] of this.engines) {
      const record = this.state[engineId];

      if (!record) {
        this.state[engineId] = {
          used: 0,
          lastReset: now.toISOString(),
        };
        continue;
      }

      const lastResetMonth = record.lastReset.slice(0, 7);
      if (lastResetMonth !== currentMonth) {
        // New month - reset counter
        record.used = 0;
        record.lastReset = now.toISOString();
      }
    }

    await this.stateProvider.saveState(this.state);
  }

  /**
   * Deduct credits for a search (synchronous version for immediate checks)
   * @returns true if successful, false if exhausted
   * @note This does NOT persist the state - call saveState() separately
   */
  charge(engineId: EngineId): boolean {
    const config = this.engines.get(engineId);
    if (!config) {
      throw new Error(`Unknown engine: ${engineId}`);
    }

    const record = this.state[engineId];
    if (!record) {
      throw new Error(`No credit record for engine: ${engineId}`);
    }

    if (record.used + config.creditCostPerSearch > config.monthlyQuota) {
      return false; // Exhausted
    }

    record.used += config.creditCostPerSearch;
    return true;
  }

  /**
   * Deduct credits for a search and persist state
   * @returns true if successful, false if exhausted
   */
  async chargeAndSave(engineId: EngineId): Promise<boolean> {
    const result = this.charge(engineId);
    if (result) {
      await this.stateProvider.saveState(this.state);
    }
    return result;
  }

  /**
   * Refund credits for a failed search
   * @note This does NOT persist the state - call saveState() separately
   */
  refund(engineId: EngineId): void {
    const config = this.engines.get(engineId);
    if (!config) {
      throw new Error(`Unknown engine: ${engineId}`);
    }

    const record = this.state[engineId];
    if (!record) {
      throw new Error(`No credit record for engine: ${engineId}`);
    }

    record.used = Math.max(0, record.used - config.creditCostPerSearch);
  }

  /**
   * Check if engine has sufficient credits
   */
  hasSufficientCredits(engineId: EngineId): boolean {
    const config = this.engines.get(engineId);
    if (!config) {
      return false;
    }

    const record = this.state[engineId];
    if (!record) {
      return true; // No usage yet
    }

    return record.used + config.creditCostPerSearch <= config.monthlyQuota;
  }

  /**
   * Get credit snapshot for an engine
   */
  getSnapshot(engineId: EngineId): CreditSnapshot {
    const config = this.engines.get(engineId);
    if (!config) {
      throw new Error(`Unknown engine: ${engineId}`);
    }

    const record = this.state[engineId] ?? {
      used: 0,
      lastReset: new Date().toISOString(),
    };

    const remaining = Math.max(0, config.monthlyQuota - record.used);

    return {
      engineId,
      quota: config.monthlyQuota,
      used: record.used,
      remaining,
      isExhausted: remaining < config.creditCostPerSearch,
    };
  }

  /**
   * Save current state to persistence layer
   */
  async saveState(): Promise<void> {
    await this.stateProvider.saveState(this.state);
  }

  /**
   * Get snapshots for all engines
   */
  listSnapshots(): CreditSnapshot[] {
    return Array.from(this.engines.keys()).map((id) => this.getSnapshot(id));
  }
}
