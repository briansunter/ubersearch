/**
 * Provider API Response Types
 *
 * Type definitions for external search provider API responses.
 * These types ensure type safety when parsing provider responses.
 */

// ============ Tavily API Types ============

/**
 * Single result from Tavily search API
 */
export interface TavilySearchResult {
  title?: string;
  url: string;
  content?: string;
  snippet?: string;
  score?: number;
  published_date?: string;
}

/**
 * Tavily search API response
 */
export interface TavilyApiResponse {
  query?: string;
  results: TavilySearchResult[];
  answer?: string;
  response_time?: number;
  images?: string[];
}

// ============ Brave API Types ============

/**
 * Single web result from Brave search API
 */
export interface BraveWebResult {
  title: string;
  url: string;
  description?: string;
  snippet?: string;
  abstract?: string;
  rank?: number;
  score?: number;
  age?: string;
  language?: string;
  family_friendly?: boolean;
}

/**
 * Brave search API response
 */
export interface BraveApiResponse {
  type?: string;
  query?: {
    original: string;
    altered?: string;
  };
  web?: {
    type?: string;
    results: BraveWebResult[];
    family_friendly?: boolean;
  };
  /** Fallback for alternative response format */
  results?: BraveWebResult[];
}

// ============ Linkup API Types ============

/**
 * Single result from Linkup search API
 */
export interface LinkupSearchResult {
  url: string;
  name?: string;
  title?: string;
  content?: string;
  snippet?: string;
  description?: string;
  score?: number;
  relevance?: number;
}

/**
 * Linkup search API response
 */
export interface LinkupApiResponse {
  results: LinkupSearchResult[];
  answer?: string;
  sources?: LinkupSearchResult[];
}

// ============ SearXNG API Types ============

/**
 * Single result from SearXNG search API
 */
export interface SearxngSearchResult {
  title?: string;
  url: string;
  content?: string;
  description?: string;
  score?: number;
  rank?: number;
  engine?: string;
  parsed_url?: string[];
  engines?: string[];
  positions?: number[];
  category?: string;
}

/**
 * Infobox from SearXNG (Wikipedia, etc.)
 */
export interface SearxngInfobox {
  infobox?: string;
  id?: string;
  content?: string;
  img_src?: string;
  urls?: Array<{ title?: string; url?: string }>;
  engine?: string;
}

/**
 * SearXNG search API response
 */
export interface SearxngApiResponse {
  query?: string;
  results: SearxngSearchResult[];
  number_of_results?: number;
  infoboxes?: SearxngInfobox[];
  suggestions?: string[];
  answers?: string[];
  corrections?: string[];
  unresponsive_engines?: string[];
}

// ============ Type Guards ============

/**
 * Type guard to check if a value is a valid Tavily result
 */
export function isTavilyResult(value: unknown): value is TavilySearchResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.url === "string" || typeof obj.title === "string";
}

/**
 * Type guard to check if a value is a valid Tavily response
 */
export function isTavilyResponse(value: unknown): value is TavilyApiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return "results" in obj && Array.isArray(obj.results);
}

/**
 * Type guard to check if a value is a valid Brave response
 */
export function isBraveResponse(value: unknown): value is BraveApiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    ("web" in obj && typeof obj.web === "object") ||
    ("results" in obj && Array.isArray(obj.results))
  );
}

/**
 * Type guard to check if a value is a valid Linkup response
 */
export function isLinkupResponse(value: unknown): value is LinkupApiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return "results" in obj && Array.isArray(obj.results);
}

/**
 * Type guard to check if a value is a valid SearXNG response
 */
export function isSearxngResponse(value: unknown): value is SearxngApiResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return "results" in obj && Array.isArray(obj.results);
}
