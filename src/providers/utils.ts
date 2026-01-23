/**
 * Shared Provider Utilities
 *
 * Common functionality extracted from search providers to reduce duplication
 * and ensure consistent behavior across all providers.
 */

import type { EngineId } from "../core/types";
import { SearchError } from "../core/types";

/**
 * Options for HTTP requests
 */
export interface FetchOptions {
  /** Request method */
  method: "GET" | "POST";
  /** Request headers */
  headers: Record<string, string>;
  /** Request body (for POST requests) */
  body?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult<T> {
  /** Parsed response data */
  data: T;
  /** Response status code */
  status: number;
  /** Time taken in milliseconds */
  tookMs: number;
}

/**
 * Get API key from environment variable
 *
 * @param engineId - Engine ID for error messages
 * @param envVarName - Environment variable name
 * @returns API key value
 * @throws SearchError if environment variable is not set
 */
export function getApiKey(engineId: EngineId, envVarName: string): string {
  const apiKey = process.env[envVarName];
  if (!apiKey) {
    throw new SearchError(engineId, "config_error", `Missing environment variable: ${envVarName}`);
  }
  return apiKey;
}

/**
 * Perform an HTTP fetch with error handling and timeout support
 *
 * @param engineId - Engine ID for error messages
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param providerDisplayName - Optional provider display name for error messages
 * @returns Parsed JSON response
 * @throws SearchError on network errors, HTTP errors, or parse errors
 */
export async function fetchWithErrorHandling<T>(
  engineId: EngineId,
  url: string,
  options: FetchOptions,
  providerDisplayName?: string,
): Promise<FetchResult<T>> {
  const started = Date.now();
  let response: Response;

  // Set up abort controller for timeout
  const controller = new AbortController();
  const timeoutId = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  try {
    response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Handle abort/timeout
    if (error instanceof Error && error.name === "AbortError") {
      throw new SearchError(
        engineId,
        "network_error",
        `Request timeout after ${options.timeoutMs}ms`,
      );
    }

    throw new SearchError(
      engineId,
      "network_error",
      `Network error: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  // Handle HTTP errors
  if (!response.ok) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // Ignore error body parsing failures
    }

    // Detect rate limiting (HTTP 429)
    const reason = response.status === 429 ? "rate_limit" : "api_error";
    const errorPrefix = providerDisplayName ? `${providerDisplayName} API error` : "API error";
    throw new SearchError(
      engineId,
      reason,
      `${errorPrefix}: HTTP ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ""}`,
      response.status,
    );
  }

  // Parse JSON response
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (error) {
    const errorPrefix = providerDisplayName
      ? `Invalid JSON response from ${providerDisplayName}`
      : "Invalid JSON response";
    throw new SearchError(
      engineId,
      "api_error",
      `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    data,
    status: response.status,
    tookMs: Date.now() - started,
  };
}

/**
 * Validate that a response contains results
 *
 * @param engineId - Engine ID for error messages
 * @param results - Results array to validate
 * @param providerName - Optional provider name for custom error message
 * @throws SearchError if results are empty or invalid
 */
export function validateResults(
  engineId: EngineId,
  results: unknown,
  providerName?: string,
): asserts results is unknown[] {
  if (!Array.isArray(results) || results.length === 0) {
    const message = providerName ? `${providerName} returned no results` : "No results returned";
    throw new SearchError(engineId, "no_results", message);
  }
}

/**
 * Build a URL with query parameters
 *
 * @param baseUrl - Base URL
 * @param params - Query parameters
 * @returns URL with query string
 */
export function buildUrl(baseUrl: string, params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, String(value));
  }
  return `${baseUrl}?${searchParams.toString()}`;
}
