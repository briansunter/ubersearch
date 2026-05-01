/**
 * Credit state persistence abstraction layer
 *
 * This module defines interfaces for credit state persistence operations,
 * separating persistence concerns from business logic. Enables unit testing
 * without file I/O and supports multiple persistence implementations.
 *
 * @module credits/CreditStateProvider
 */

import type { EngineId } from "../types";

/**
 * Represents the persistent state of credit usage for search engines.
 * Maps engine IDs to their usage tracking data.
 *
 * @interface CreditState
 */
export interface CreditRecord {
  /**
   * Total number of credits used by this engine in the current billing period.
   */
  used: number;

  /**
   * ISO 8601 date string indicating when the credits were last reset.
   * Used to determine when monthly quotas should be refreshed.
   */
  lastReset: string;
}

export interface CreditState {
  /**
   * Maps engine identifiers to their credit usage information.
   * Each entry tracks the total credits used and the last reset timestamp.
   */
  [engineId: EngineId]: CreditRecord;
}

/**
 * Type guard for a well-formed credit record. Used during persistence load
 * (drop malformed entries) and at runtime (treat unknown shape as missing).
 */
export function isValidCreditRecord(value: unknown): value is CreditRecord {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as { used?: unknown; lastReset?: unknown };
  return (
    typeof candidate.used === "number" &&
    Number.isFinite(candidate.used) &&
    candidate.used >= 0 &&
    typeof candidate.lastReset === "string" &&
    !Number.isNaN(Date.parse(candidate.lastReset))
  );
}

/**
 * Abstraction for credit state persistence operations.
 *
 * This interface defines the contract for loading, saving, and checking
 * the existence of credit state data. Implementations can use various
 * persistence mechanisms (file system, memory, database, etc.) while
 * maintaining the same API for the business logic layer.
 *
 * All methods are asynchronous to support both synchronous and
 * asynchronous persistence backends without blocking the main thread.
 *
 * @interface CreditStateProvider
 *
 * @example
 * ```typescript
 * // File-based implementation
 * class FileCreditStateProvider implements CreditStateProvider {
 *   async loadState(): Promise<CreditState> {
 *     const data = await fs.readFile(this.filePath, 'utf8');
 *     return JSON.parse(data);
 *   }
 *
 *   async saveState(state: CreditState): Promise<void> {
 *     await fs.writeFile(this.filePath, JSON.stringify(state));
 *   }
 *
 *   async stateExists(): Promise<boolean> {
 *     return fs.exists(this.filePath);
 *   }
 * }
 *
 * // Memory-based implementation for testing
 * class MemoryCreditStateProvider implements CreditStateProvider {
 *   private state: CreditState = {};
 *
 *   async loadState(): Promise<CreditState> {
 *     return { ...this.state };
 *   }
 *
 *   async saveState(state: CreditState): Promise<void> {
 *     this.state = { ...state };
 *   }
 *
 *   async stateExists(): Promise<boolean> {
 *     return Object.keys(this.state).length > 0;
 *   }
 * }
 * ```
 */
export interface CreditStateProvider {
  /**
   * Load the current credit state from persistence.
   *
   * @returns Promise resolving to the current credit state.
   *          Returns empty object `{}` if no state exists.
   *
   * @throws May throw errors related to persistence layer failures
   *         (file system errors, network issues, etc.).
   *
   * @example
   * ```typescript
   * const provider = new FileCreditStateProvider();
   * const state = await provider.loadState();
   * console.log(`Loaded state for ${Object.keys(state).length} engines`);
   * ```
   */
  loadState(): Promise<CreditState>;

  /**
   * Save the credit state to persistence.
   *
   * @param state - The credit state to persist.
   *                Should be a complete snapshot of current usage.
   *
   * @returns Promise that resolves when the state has been successfully saved.
   *
   * @throws May throw errors related to persistence layer failures
   *         (file system errors, network issues, permission errors, etc.).
   *
   * @example
   * ```typescript
   * const newState: CreditState = {
   *   'google': { used: 50, lastReset: '2024-01-15T10:30:00.000Z' },
   *   'bing': { used: 25, lastReset: '2024-01-15T10:30:00.000Z' }
   * };
   * await provider.saveState(newState);
   * ```
   */
  saveState(state: CreditState): Promise<void>;

  /**
   * Check if credit state exists in persistence.
   *
   * Used to determine whether to load existing state or initialize
   * with default values.
   *
   * @returns Promise resolving to true if state exists in persistence,
   *          false otherwise.
   *
   * @throws May throw errors related to persistence layer failures.
   *
   * @example
   * ```typescript
   * if (await provider.stateExists()) {
   *   const state = await provider.loadState();
   *   // Process existing state
   * } else {
   *   // Initialize with default state
   *   await provider.saveState({});
   * }
   * ```
   */
  stateExists(): Promise<boolean>;
}
