/**
 * Retry Logic for Provider Operations
 *
 * Provides exponential backoff retry functionality for resilient
 * provider operations
 */

import type { EngineId } from "../core/types";
import { SearchError } from "../core/types";

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;

  /** Initial delay between retries in milliseconds */
  initialDelayMs?: number;

  /** Multiplier for exponential backoff */
  backoffMultiplier?: number;

  /** Maximum delay between retries in milliseconds */
  maxDelayMs?: number;

  /** Whether to retry on specific error types */
  retryableErrors?: Array<"network_error" | "api_error" | "rate_limit" | "no_results" | "timeout">;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  retryableErrors: ["network_error", "api_error", "rate_limit", "no_results"],
};

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param engineId - Engine ID for error messages
 * @param fn - Function to execute with retry logic
 * @param config - Retry configuration
 * @returns Result of the function
 * @throws SearchError if all retry attempts fail
 */
export async function withRetry<T>(
  engineId: EngineId,
  fn: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const {
    maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelayMs = DEFAULT_RETRY_CONFIG.initialDelayMs,
    backoffMultiplier = DEFAULT_RETRY_CONFIG.backoffMultiplier,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    retryableErrors = DEFAULT_RETRY_CONFIG.retryableErrors,
  } = config;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!(error instanceof SearchError)) {
        throw error;
      }

      const shouldRetry = retryableErrors.includes(
        error.reason as "network_error" | "api_error" | "rate_limit" | "no_results",
      );

      if (!shouldRetry || attempt >= maxAttempts) {
        throw error;
      }

      const nextDelay = Math.min(delay * backoffMultiplier, maxDelayMs);

      console.warn(
        `[${engineId}] Attempt ${attempt}/${maxAttempts} failed: ${error.message}. Retrying in ${nextDelay}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, nextDelay));
      delay = nextDelay;
    }
  }

  throw lastError;
}
