/**
 * Core search types and error handling
 */

export type EngineId = string;

export interface SearchQuery {
  query: string;
  limit?: number;
  includeRaw?: boolean;
  /** SearXNG categories to search (e.g., "general", "it", "science") */
  categories?: string[];
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  sourceEngine: EngineId;
}

export interface SearchResponse {
  engineId: EngineId;
  items: SearchResultItem[];
  raw?: unknown;
  tookMs: number;
}

export type SearchFailureReason =
  | "network_error"
  | "api_error"
  | "rate_limit"
  | "no_results"
  | "low_credit"
  | "config_error"
  | "no_provider"
  | "provider_unavailable"
  | "unknown";

/**
 * Error thrown when a search provider fails
 */
export class SearchError extends Error {
  engineId: EngineId;
  reason: SearchFailureReason;
  statusCode?: number;

  constructor(
    engineId: EngineId,
    reason: SearchFailureReason,
    message: string,
    statusCode?: number,
  ) {
    super(message);
    this.name = "SearchError";
    this.engineId = engineId;
    this.reason = reason;
    this.statusCode = statusCode;
  }
}
