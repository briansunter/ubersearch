/**
 * Provider Utilities Unit Tests
 *
 * Tests for src/providers/utils.ts
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { SearchError } from "../../../src/core/types";
import {
  buildUrl,
  fetchWithErrorHandling,
  getApiKey,
  validateResults,
} from "../../../src/providers/utils";

// Store original fetch to restore after tests
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("getApiKey", () => {
  test("should return the API key when the env var is set", () => {
    process.env.TEST_API_KEY = "my-secret-key";
    const key = getApiKey("test-engine", "TEST_API_KEY");
    expect(key).toBe("my-secret-key");
    delete process.env.TEST_API_KEY;
  });

  test("should throw SearchError with config_error when env var is missing", () => {
    delete process.env.NONEXISTENT_KEY;
    expect(() => getApiKey("test-engine", "NONEXISTENT_KEY")).toThrow(SearchError);
    try {
      getApiKey("test-engine", "NONEXISTENT_KEY");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("config_error");
      expect((error as SearchError).engineId).toBe("test-engine");
      expect((error as SearchError).message).toContain("NONEXISTENT_KEY");
    }
  });

  test("should throw SearchError when env var is empty string", () => {
    process.env.EMPTY_KEY = "";
    expect(() => getApiKey("test-engine", "EMPTY_KEY")).toThrow(SearchError);
    delete process.env.EMPTY_KEY;
  });
});

describe("fetchWithErrorHandling", () => {
  describe("successful responses", () => {
    test("should return parsed JSON data on successful fetch", async () => {
      const responseData = { results: [{ title: "Test" }] };

      globalThis.fetch = mock(
        async () =>
          new Response(JSON.stringify(responseData), {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "application/json" },
          }),
      ) as unknown as typeof fetch;

      const result = await fetchWithErrorHandling<typeof responseData>(
        "test-engine",
        "https://api.example.com/search",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "test" }),
        },
      );

      expect(result.data).toEqual(responseData);
      expect(result.status).toBe(200);
      expect(result.tookMs).toBeGreaterThanOrEqual(0);
    });

    test("should pass correct request options to fetch", async () => {
      const fetchMock = mock(async (url: string, init?: RequestInit) => {
        expect(url).toBe("https://api.example.com/search");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({ Authorization: "Bearer key123" });
        expect(init?.body).toBe('{"q":"test"}');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
        method: "POST",
        headers: { Authorization: "Bearer key123" },
        body: '{"q":"test"}',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test("should handle GET requests without body", async () => {
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        expect(init?.method).toBe("GET");
        expect(init?.body).toBeUndefined();
        return new Response(JSON.stringify({ data: "value" }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await fetchWithErrorHandling("test-engine", "https://api.example.com/data", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      expect(result.data).toEqual({ data: "value" });
    });
  });

  describe("HTTP error responses", () => {
    test("should throw SearchError with rate_limit reason on HTTP 429", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("Rate limit exceeded", {
            status: 429,
            statusText: "Too Many Requests",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        const searchError = error as SearchError;
        expect(searchError.reason).toBe("rate_limit");
        expect(searchError.engineId).toBe("test-engine");
        expect(searchError.statusCode).toBe(429);
        expect(searchError.message).toContain("429");
      }
    });

    test("should throw SearchError with api_error reason on HTTP 500", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("Internal Server Error", {
            status: 500,
            statusText: "Internal Server Error",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        const searchError = error as SearchError;
        expect(searchError.reason).toBe("api_error");
        expect(searchError.statusCode).toBe(500);
        expect(searchError.message).toContain("500");
      }
    });

    test("should throw SearchError with api_error reason on HTTP 401", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("Unauthorized", {
            status: 401,
            statusText: "Unauthorized",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        const searchError = error as SearchError;
        expect(searchError.reason).toBe("api_error");
        expect(searchError.statusCode).toBe(401);
      }
    });

    test("should include providerDisplayName in error message when provided", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("", {
            status: 503,
            statusText: "Service Unavailable",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling(
          "tavily",
          "https://api.example.com/search",
          { method: "GET", headers: {} },
          "Tavily",
        );
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as SearchError).message).toContain("Tavily API error");
      }
    });

    test("should use generic prefix when providerDisplayName is not provided", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("", {
            status: 503,
            statusText: "Service Unavailable",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as SearchError).message).toContain("API error");
        expect((error as SearchError).message).not.toMatch(/^\w+ API error/);
      }
    });

    test("should include error body text in error message", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response('{"error":"quota exceeded"}', {
            status: 403,
            statusText: "Forbidden",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as SearchError).message).toContain("quota exceeded");
      }
    });
  });

  describe("network errors", () => {
    test("should throw SearchError with network_error reason on fetch failure", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:443");
      }) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        const searchError = error as SearchError;
        expect(searchError.reason).toBe("network_error");
        expect(searchError.message).toContain("ECONNREFUSED");
      }
    });

    test("should throw SearchError with network_error on DNS failure", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.example.com");
      }) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        expect((error as SearchError).reason).toBe("network_error");
        expect((error as SearchError).message).toContain("ENOTFOUND");
      }
    });
  });

  describe("timeout via AbortController", () => {
    test("should throw SearchError with network_error on timeout/abort", async () => {
      globalThis.fetch = mock(async () => {
        // Simulate an AbortError, as the real fetch would throw
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        throw abortError;
      }) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
          timeoutMs: 100,
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        const searchError = error as SearchError;
        expect(searchError.reason).toBe("network_error");
        expect(searchError.message).toContain("timeout");
      }
    });

    test("should pass signal to fetch when timeoutMs is set", async () => {
      globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
        expect(init?.signal).toBeDefined();
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof fetch;

      await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
        method: "GET",
        headers: {},
        timeoutMs: 5000,
      });
    });
  });

  describe("JSON parse errors", () => {
    test("should throw SearchError with api_error on invalid JSON", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("this is not json!", {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "text/html" },
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling("test-engine", "https://api.example.com/search", {
          method: "GET",
          headers: {},
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SearchError);
        expect((error as SearchError).reason).toBe("api_error");
        expect((error as SearchError).message).toContain("Invalid JSON response");
      }
    });

    test("should include providerDisplayName in JSON parse error when provided", async () => {
      globalThis.fetch = mock(
        async () =>
          new Response("<html>Not JSON</html>", {
            status: 200,
            statusText: "OK",
          }),
      ) as unknown as typeof fetch;

      try {
        await fetchWithErrorHandling(
          "brave",
          "https://api.example.com/search",
          { method: "GET", headers: {} },
          "Brave",
        );
        expect.unreachable("should have thrown");
      } catch (error) {
        expect((error as SearchError).message).toContain("Invalid JSON response from Brave");
      }
    });
  });

  describe("timing measurement", () => {
    test("should measure tookMs accurately", async () => {
      globalThis.fetch = mock(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as unknown as typeof fetch;

      const result = await fetchWithErrorHandling("test-engine", "https://api.example.com/data", {
        method: "GET",
        headers: {},
      });

      expect(result.tookMs).toBeGreaterThanOrEqual(20);
      expect(result.tookMs).toBeLessThan(200);
    });
  });
});

describe("validateResults", () => {
  test("should not throw for a non-empty array", () => {
    expect(() => validateResults("test-engine", [{ title: "Result" }])).not.toThrow();
  });

  test("should throw SearchError with no_results for empty array", () => {
    try {
      validateResults("test-engine", []);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).reason).toBe("no_results");
    }
  });

  test("should throw SearchError with no_results for null", () => {
    expect(() => validateResults("test-engine", null)).toThrow(SearchError);
  });

  test("should throw SearchError with no_results for undefined", () => {
    expect(() => validateResults("test-engine", undefined)).toThrow(SearchError);
  });

  test("should throw SearchError with no_results for non-array value", () => {
    expect(() => validateResults("test-engine", "not an array")).toThrow(SearchError);
    expect(() => validateResults("test-engine", 42)).toThrow(SearchError);
    expect(() => validateResults("test-engine", {})).toThrow(SearchError);
  });

  test("should include providerName in error message when provided", () => {
    try {
      validateResults("tavily", [], "Tavily");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as SearchError).message).toBe("Tavily returned no results");
    }
  });

  test("should use generic message when providerName is not provided", () => {
    try {
      validateResults("test-engine", []);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as SearchError).message).toBe("No results returned");
    }
  });
});

describe("buildUrl", () => {
  test("should build URL with string parameters", () => {
    const url = buildUrl("https://api.example.com/search", {
      q: "test query",
      format: "json",
    });
    expect(url).toBe("https://api.example.com/search?q=test+query&format=json");
  });

  test("should build URL with numeric parameters", () => {
    const url = buildUrl("https://api.example.com/search", {
      q: "test",
      limit: 10,
      page: 1,
    });
    expect(url).toContain("limit=10");
    expect(url).toContain("page=1");
    expect(url).toContain("q=test");
  });

  test("should handle mixed string and number parameters", () => {
    const url = buildUrl("https://api.example.com/search", {
      q: "query",
      limit: 5,
    });
    expect(url).toBe("https://api.example.com/search?q=query&limit=5");
  });

  test("should handle empty params object", () => {
    const url = buildUrl("https://api.example.com/search", {});
    expect(url).toBe("https://api.example.com/search?");
  });

  test("should encode special characters in parameter values", () => {
    const url = buildUrl("https://api.example.com/search", {
      q: "hello world & goodbye",
    });
    // URLSearchParams encodes & as %26 and spaces as +
    expect(url).toContain("q=hello+world+%26+goodbye");
  });
});
