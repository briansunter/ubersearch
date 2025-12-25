/**
 * Input and output interfaces for the ubersearch tool
 */

export interface UberSearchInput {
  /** Search query string */
  query: string;

  /** Maximum number of results to return per provider */
  limit?: number;

  /** Specific engines to use (overrides config default order) */
  engines?: string[];

  /** Include raw provider responses in output */
  includeRaw?: boolean;

  /** Search strategy: 'all' (query all) or 'first-success' (stop after first success) */
  strategy?: "all" | "first-success";

  /**
   * Execute searches in parallel (only applies to 'all' strategy)
   * When true, all providers are queried simultaneously
   * When false (default), providers are queried sequentially
   */
  parallel?: boolean;
}

export interface UberSearchEngineAttempt {
  /** Provider/engine ID that was attempted */
  engineId: string;

  /** Whether the attempt succeeded */
  success: boolean;

  /** Reason for failure (if success=false) */
  reason?: string;
}

export interface UberSearchOutputItem {
  /** Result title */
  title: string;

  /** Result URL */
  url: string;

  /** Snippet/excerpt */
  snippet: string;

  /** Relevance score (if provided by engine) */
  score?: number;

  /** Source engine that returned this result */
  sourceEngine: string;
}

import type { CreditSnapshot } from "../core/credits";

export interface UberSearchOutput {
  /** Original query */
  query: string;

  /** Combined search results from all successful providers */
  items: UberSearchOutputItem[];

  /** Metadata about which engines were tried and their outcomes */
  enginesTried: UberSearchEngineAttempt[];

  /** Credit snapshots for each engine after the search */
  credits?: CreditSnapshot[];
}
