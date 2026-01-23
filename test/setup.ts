/**
 * Global Test Setup
 *
 * This file is preloaded before all tests run.
 * It sets up the test environment, mocks, and ensures proper isolation.
 *
 * NOTE: Environment variables like SKIP_DOCKER_TESTS are set in the
 * npm test scripts (package.json) to ensure they're available during
 * module evaluation.
 */

// Ensure SKIP_DOCKER_TESTS is preserved from the shell environment
// This is needed because bun's test runner may not preserve env vars correctly
if (process.env.SKIP_DOCKER_TESTS === undefined) {
  // Default to true if not explicitly set (safe default for CI)
  process.env.SKIP_DOCKER_TESTS = "true";
}

// Disable retry logic in tests to prevent timeouts
process.env.DISABLE_RETRY = "true";

import { afterEach, beforeEach } from "bun:test";

// Dynamic import to avoid caching issues
let resetStrategyFactory: () => void;

// Try to load StrategyFactory reset function
try {
  const mod = await import("../src/core/strategy/StrategyFactory");
  resetStrategyFactory = () => {
    if (typeof mod.StrategyFactory?.reset === "function") {
      mod.StrategyFactory.reset();
    }
  };
} catch {
  resetStrategyFactory = () => {}; // No-op if import fails
}

// ============ Store Originals ============

// Environment variables - store a snapshot
const originalEnv = { ...process.env };

// Console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
};

// Global fetch
const originalFetch = globalThis.fetch;

// ============ Global Hooks ============

beforeEach(() => {
  // Suppress console output unless DEBUG_TESTS is set
  if (!process.env.DEBUG_TESTS && !process.env.ENABLE_TEST_LOGS) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.info = () => {};
    console.debug = () => {};
  }

  // Reset StrategyFactory to default state
  resetStrategyFactory();
});

afterEach(() => {
  // Restore console methods
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;

  // Restore fetch if it was mocked
  globalThis.fetch = originalFetch;

  // Restore critical environment variables
  // (keeping test API keys to avoid breaking other tests)
  process.env.TAVILY_API_KEY = "test-tavily-key";
  process.env.BRAVE_API_KEY = "test-brave-key";
  process.env.SEARXNG_API_KEY = "test-searxng-key";
  process.env.LINKUP_API_KEY = "test-linkup-key";

  // Reset StrategyFactory again for good measure
  resetStrategyFactory();
});

// ============ Exports for Test Files ============

export { originalEnv, originalConsole, originalFetch };

/**
 * Utility to temporarily mock fetch for a test
 */
export function mockFetch(handler: typeof fetch): void {
  globalThis.fetch = handler;
}

/**
 * Utility to restore the original fetch
 */
export function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

/**
 * Utility to temporarily set an environment variable
 */
export function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

/**
 * Utility to delete an environment variable
 */
export function deleteEnv(key: string): void {
  delete process.env[key];
}
