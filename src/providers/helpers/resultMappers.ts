/**
 * Result Mapping Helper Functions
 *
 * Provides utilities for mapping API responses to normalized SearchResultItem format.
 * Uses a configuration-based approach to handle different field names across providers.
 */

import type { SearchResultItem } from "../../core/types";

/**
 * Configuration for mapping fields from raw API response to SearchResultItem
 *
 * Each property is an array of field names to try, in order of preference.
 * The first non-null/undefined value found will be used.
 */
export interface FieldMappings {
  /** Fields to try for the title (default: ['title', 'name', 'url']) */
  title?: string[];
  /** Fields to try for the URL (default: ['url', 'link', 'href']) */
  url?: string[];
  /** Fields to try for the snippet (default: ['content', 'description', 'snippet']) */
  snippet?: string[];
  /** Fields to try for the score (default: ['score', 'rank', 'relevance']) */
  score?: string[];
  /** Field to use for source engine (default: none, uses provided engineId) */
  sourceEngine?: string;
}

/**
 * Default field mappings that work for most providers
 */
export const DEFAULT_FIELD_MAPPINGS: Required<Omit<FieldMappings, "sourceEngine">> = {
  title: ["title", "name", "url"],
  url: ["url", "link", "href"],
  snippet: ["content", "description", "snippet", "excerpt"],
  score: ["score", "rank", "relevance", "priority"],
};

/**
 * Get the first non-null/undefined value from an object by trying multiple keys
 *
 * @param obj - Object to extract value from
 * @param keys - Array of keys to try, in order of preference
 * @returns The first found value, or undefined if none found
 */
export function getFirstMatch<T = unknown>(
  obj: Record<string, unknown>,
  keys: string[],
): T | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      return value as T;
    }
  }
  return undefined;
}

/**
 * Map a single raw result object to a SearchResultItem
 *
 * @param raw - Raw result object from API
 * @param engineId - Engine ID to use for sourceEngine
 * @param mappings - Optional custom field mappings (merged with defaults)
 * @returns Normalized SearchResultItem
 *
 * @example
 * ```typescript
 * // Using default mappings
 * const item = mapSearchResult(rawResult, 'tavily');
 *
 * // Using custom mappings
 * const item = mapSearchResult(rawResult, 'custom-engine', {
 *   title: ['headline', 'title', 'name'],
 *   snippet: ['body', 'text', 'content'],
 * });
 * ```
 */
export function mapSearchResult(
  raw: unknown,
  engineId: string,
  mappings: FieldMappings = {},
): SearchResultItem {
  const r = raw as Record<string, unknown>;

  // Merge with defaults
  const titleKeys = mappings.title ?? DEFAULT_FIELD_MAPPINGS.title;
  const urlKeys = mappings.url ?? DEFAULT_FIELD_MAPPINGS.url;
  const snippetKeys = mappings.snippet ?? DEFAULT_FIELD_MAPPINGS.snippet;
  const scoreKeys = mappings.score ?? DEFAULT_FIELD_MAPPINGS.score;

  return {
    title: String(getFirstMatch(r, titleKeys) ?? "Untitled"),
    url: String(getFirstMatch(r, urlKeys) ?? ""),
    snippet: String(getFirstMatch(r, snippetKeys) ?? ""),
    score: getFirstMatch<number>(r, scoreKeys),
    sourceEngine: mappings.sourceEngine ? String(r[mappings.sourceEngine] ?? engineId) : engineId,
  };
}

/**
 * Map an array of raw results to SearchResultItems
 *
 * @param results - Array of raw result objects
 * @param engineId - Engine ID to use for sourceEngine
 * @param mappings - Optional custom field mappings
 * @param filter - Optional filter function to exclude invalid results
 * @returns Array of normalized SearchResultItems
 *
 * @example
 * ```typescript
 * const items = mapSearchResults(
 *   json.results,
 *   'brave',
 *   { title: ['title', 'name'] },
 *   (r) => r.url != null  // Filter out results without URL
 * );
 * ```
 */
export function mapSearchResults(
  results: unknown[],
  engineId: string,
  mappings: FieldMappings = {},
  filter?: (raw: Record<string, unknown>) => boolean,
): SearchResultItem[] {
  return results
    .filter((r): r is Record<string, unknown> => {
      if (r == null || typeof r !== "object") {
        return false;
      }
      if (filter) {
        return filter(r as Record<string, unknown>);
      }
      return true;
    })
    .map((r) => mapSearchResult(r, engineId, mappings));
}

/**
 * Pre-configured field mappings for known providers
 */
export const PROVIDER_MAPPINGS = {
  tavily: {
    title: ["title", "url"],
    url: ["url"],
    snippet: ["content", "snippet"],
    score: ["score"],
  },
  brave: {
    title: ["title", "url"],
    url: ["url"],
    snippet: ["description", "snippet", "abstract"],
    score: ["rank", "score"],
  },
  linkup: {
    title: ["name", "title", "url"],
    url: ["url"],
    snippet: ["content", "snippet", "description"],
    score: ["score", "relevance"],
  },
  searchxng: {
    title: ["title", "url"],
    url: ["url"],
    snippet: ["content", "description"],
    score: ["score", "rank"],
    sourceEngine: "engine",
  },
} as const satisfies Record<string, FieldMappings>;
