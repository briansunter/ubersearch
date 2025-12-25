/**
 * File-based implementation of CreditStateProvider
 * Handles file I/O operations for credit state persistence using Bun's async APIs
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger";
import type { CreditState, CreditStateProvider } from "./CreditStateProvider";

const log = createLogger("CreditState");

/**
 * File-based persistence implementation of CreditStateProvider.
 * Manages credit state storage using the local filesystem with async I/O.
 *
 * @remarks
 * This provider stores credit state as JSON in the following locations:
 * - Default: ~/.local/state/ai-search/credits.json
 * - With XDG_STATE_HOME: $XDG_STATE_HOME/ai-search/credits.json
 *
 * Uses Bun's async file APIs for non-blocking I/O operations.
 * The provider handles directory creation automatically and never throws errors,
 * instead logging warnings and returning sensible defaults.
 *
 * @example
 * ```typescript
 * const provider = new FileCreditStateProvider();
 * const state = await provider.loadState();
 * await provider.saveState(newState);
 * ```
 */
export class FileCreditStateProvider implements CreditStateProvider {
  private readonly statePath: string;

  /**
   * Creates a new FileCreditStateProvider instance.
   *
   * @param statePath - Optional custom path for the state file.
   *                   If not provided, uses the default location based on
   *                   XDG_STATE_HOME or ~/.local/state/ai-search/credits.json
   */
  constructor(statePath?: string) {
    this.statePath = statePath ?? this.getDefaultStatePath();
  }

  /**
   * Gets the default state file path following XDG Base Directory Specification.
   *
   * @returns The resolved state file path
   * @private
   */
  private getDefaultStatePath(): string {
    const base = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
    return join(base, "ai-search", "credits.json");
  }

  /**
   * Load credit state from the file system using async I/O.
   *
   * @returns The loaded credit state, or an empty object if the file doesn't exist
   *          or cannot be parsed
   *
   * @remarks
   * This method never throws. If the file doesn't exist, an empty state is returned.
   * If the file exists but cannot be parsed, a warning is logged and an empty state
   * is returned. Uses Bun.file() for non-blocking file reads.
   */
  async loadState(): Promise<CreditState> {
    const file = Bun.file(this.statePath);

    // Check if file exists
    if (!(await file.exists())) {
      return {};
    }

    try {
      const raw = await file.text();
      return JSON.parse(raw) as CreditState;
    } catch (error) {
      log.warn(`Failed to load credit state from ${this.statePath}:`, error);
      return {};
    }
  }

  /**
   * Save credit state to the file system using async I/O.
   *
   * @param state - The credit state to save
   *
   * @remarks
   * This method never throws. If the directory doesn't exist, it will be created
   * recursively. If saving fails, a warning is logged but no error is thrown.
   * Uses Bun.write() for non-blocking file writes.
   */
  async saveState(state: CreditState): Promise<void> {
    try {
      // Ensure parent directory exists
      const { dirname } = await import("node:path");
      const { mkdir } = await import("node:fs/promises");
      const dir = dirname(this.statePath);

      try {
        await mkdir(dir, { recursive: true });
      } catch (mkdirError) {
        // Ignore EEXIST errors
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") {
          throw mkdirError;
        }
      }

      // Write file using Bun's async API
      await Bun.write(this.statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      log.warn(`Failed to save credit state to ${this.statePath}:`, error);
    }
  }

  /**
   * Check if the state file exists in the file system.
   *
   * @returns true if the state file exists, false otherwise
   */
  async stateExists(): Promise<boolean> {
    const file = Bun.file(this.statePath);
    return await file.exists();
  }

  /**
   * Get the path where state is stored.
   *
   * @returns The absolute path to the state file
   */
  getStatePath(): string {
    return this.statePath;
  }
}
