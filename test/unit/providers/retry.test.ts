/**
 * Retry Logic Unit Tests
 *
 * Tests for src/core/retry.ts (re-exported from src/providers/retry.ts)
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_RETRY_CONFIG, withRetry } from "../../../src/core/retry";
import { SearchError } from "../../../src/core/types";

describe("withRetry", () => {
  const savedDisableRetry = process.env.DISABLE_RETRY;

  beforeEach(() => {
    // Enable retry logic for these tests (test/setup.ts sets DISABLE_RETRY=true by default)
    delete process.env.DISABLE_RETRY;
  });

  afterEach(() => {
    // Restore the original value
    if (savedDisableRetry !== undefined) {
      process.env.DISABLE_RETRY = savedDisableRetry;
    } else {
      delete process.env.DISABLE_RETRY;
    }
  });

  describe("successful execution", () => {
    test("should return result on first successful attempt", async () => {
      const fn = mock(() => Promise.resolve("success"));

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should return complex objects from the wrapped function", async () => {
      const data = { items: [{ title: "Result" }], total: 1 };
      const fn = mock(() => Promise.resolve(data));

      const result = await withRetry("test-engine", fn);

      expect(result).toEqual(data);
    });
  });

  describe("retryable errors", () => {
    test("should retry on network_error and succeed", async () => {
      let attempts = 0;
      const fn = mock(async () => {
        attempts++;
        if (attempts < 3) {
          throw new SearchError("test-engine", "network_error", "Connection failed");
        }
        return "recovered";
      });

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        backoffMultiplier: 1,
        maxDelayMs: 1,
      });

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("should retry on rate_limit errors", async () => {
      let attempts = 0;
      const fn = mock(async () => {
        attempts++;
        if (attempts === 1) {
          throw new SearchError("test-engine", "rate_limit", "Too many requests", 429);
        }
        return "ok";
      });

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        backoffMultiplier: 1,
        maxDelayMs: 1,
      });

      expect(result).toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("should retry on api_error errors", async () => {
      let attempts = 0;
      const fn = mock(async () => {
        attempts++;
        if (attempts === 1) {
          throw new SearchError("test-engine", "api_error", "Server error", 500);
        }
        return "recovered";
      });

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        backoffMultiplier: 1,
        maxDelayMs: 1,
      });

      expect(result).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("should retry on no_results errors by default", async () => {
      let attempts = 0;
      const fn = mock(async () => {
        attempts++;
        if (attempts === 1) {
          throw new SearchError("test-engine", "no_results", "No results found");
        }
        return "found";
      });

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
        backoffMultiplier: 1,
        maxDelayMs: 1,
      });

      expect(result).toBe("found");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("non-retryable errors", () => {
    test("should NOT retry on config_error", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "config_error", "Missing API key");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow("Missing API key");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should NOT retry on no_provider error", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "no_provider", "No provider configured");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow("No provider configured");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should NOT retry on provider_unavailable error", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "provider_unavailable", "Provider down");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow("Provider down");

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("max attempts", () => {
    test("should throw after exhausting all retry attempts", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "network_error", "Always fails");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
          backoffMultiplier: 1,
          maxDelayMs: 1,
        }),
      ).rejects.toThrow("Always fails");

      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("should respect maxAttempts=1 (no retries)", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "network_error", "Fails once");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 1,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow("Fails once");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should call function exactly maxAttempts times on persistent retryable failure", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "api_error", "Server down", 500);
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 5,
          initialDelayMs: 1,
          backoffMultiplier: 1,
          maxDelayMs: 1,
        }),
      ).rejects.toThrow("Server down");

      expect(fn).toHaveBeenCalledTimes(5);
    });
  });

  describe("DISABLE_RETRY environment variable", () => {
    test("should skip retry logic and call fn directly when DISABLE_RETRY=true", async () => {
      process.env.DISABLE_RETRY = "true";

      const fn = mock(() => Promise.resolve("direct"));

      const result = await withRetry("test-engine", fn, {
        maxAttempts: 3,
        initialDelayMs: 1,
      });

      expect(result).toBe("direct");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should propagate errors without retry when DISABLE_RETRY=true", async () => {
      process.env.DISABLE_RETRY = "true";

      const fn = mock(async () => {
        throw new SearchError("test-engine", "network_error", "Connection lost");
      });

      await expect(withRetry("test-engine", fn, { maxAttempts: 3 })).rejects.toThrow(
        "Connection lost",
      );

      // Should only be called once -- no retry
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("non-SearchError exceptions", () => {
    test("should immediately re-throw a regular Error without retrying", async () => {
      const fn = mock(async () => {
        throw new Error("Unexpected bug");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow("Unexpected bug");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should immediately re-throw a TypeError without retrying", async () => {
      const fn = mock(async () => {
        throw new TypeError("Cannot read property 'x' of undefined");
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow(TypeError);

      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("should immediately re-throw a string throw without retrying", async () => {
      const fn = mock(async () => {
        throw "string error";
      });

      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
        }),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("custom retryableErrors config", () => {
    test("should only retry errors listed in retryableErrors", async () => {
      let attempts = 0;
      const fn = mock(async () => {
        attempts++;
        if (attempts === 1) {
          throw new SearchError("test-engine", "rate_limit", "Rate limited");
        }
        return "ok";
      });

      // Only allow network_error retries -- rate_limit is NOT in the list
      await expect(
        withRetry("test-engine", fn, {
          maxAttempts: 3,
          initialDelayMs: 1,
          retryableErrors: ["network_error"],
        }),
      ).rejects.toThrow("Rate limited");

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("default retry config", () => {
    test("DEFAULT_RETRY_CONFIG should have expected values", () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3);
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(1000);
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2);
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(10000);
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("network_error");
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("api_error");
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("rate_limit");
      expect(DEFAULT_RETRY_CONFIG.retryableErrors).toContain("no_results");
    });
  });

  describe("thrown error identity", () => {
    test("should throw a SearchError instance on failure", async () => {
      const fn = mock(async () => {
        throw new SearchError("test-engine", "network_error", "Failed");
      });

      try {
        await withRetry("test-engine", fn, {
          maxAttempts: 1,
          initialDelayMs: 1,
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        expect((error as SearchError).reason).toBe("network_error");
        expect((error as SearchError).engineId).toBe("test-engine");
      }
    });
  });
});
