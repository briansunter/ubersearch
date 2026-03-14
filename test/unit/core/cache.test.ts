/**
 * SearchCache Unit Tests
 *
 * Tests for src/core/cache.ts
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { SearchCache } from "../../../src/core/cache";

describe("SearchCache", () => {
  let cache: SearchCache;

  beforeEach(() => {
    cache = new SearchCache();
  });

  describe("set and get", () => {
    test("should store and retrieve a string value", () => {
      cache.set("key1", "hello");
      expect(cache.get<string>("key1")).toBe("hello");
    });

    test("should store and retrieve an object value", () => {
      const data = { items: [{ title: "Result 1" }], total: 1 };
      cache.set("search:query1", data);
      expect(cache.get<typeof data>("search:query1")).toEqual(data);
    });

    test("should store and retrieve a number value", () => {
      cache.set("count", 42);
      expect(cache.get<number>("count")).toBe(42);
    });

    test("should store and retrieve null as a valid value", () => {
      cache.set("nullable", null);
      expect(cache.get<null>("nullable")).toBeNull();
    });

    test("should overwrite an existing value with the same key", () => {
      cache.set("key", "first");
      cache.set("key", "second");
      expect(cache.get<string>("key")).toBe("second");
    });
  });

  describe("cache miss", () => {
    test("should return undefined for a key that was never set", () => {
      expect(cache.get("nonexistent")).toBeUndefined();
    });

    test("should return undefined for an empty string key that was never set", () => {
      expect(cache.get("")).toBeUndefined();
    });
  });

  describe("TTL expiration", () => {
    test("should return the value before TTL expires", () => {
      cache.set("key", "value", 60_000);
      expect(cache.get<string>("key")).toBe("value");
    });

    test("should return undefined after TTL expires", async () => {
      // Use a very short TTL so it expires quickly
      cache.set("key", "value", 1);
      // Wait just past the TTL
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(cache.get("key")).toBeUndefined();
    });

    test("should expire items independently based on their TTL", async () => {
      cache.set("short", "gone", 1);
      cache.set("long", "still here", 60_000);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(cache.get("short")).toBeUndefined();
      expect(cache.get<string>("long")).toBe("still here");
    });

    test("should use default TTL when none is specified", () => {
      // The default TTL is 5 minutes (300_000 ms), so the entry should be available immediately
      cache.set("default-ttl", "value");
      expect(cache.get<string>("default-ttl")).toBe("value");
    });
  });

  describe("key isolation", () => {
    test("different keys should not interfere with each other", () => {
      cache.set("key-a", "alpha");
      cache.set("key-b", "bravo");
      cache.set("key-c", "charlie");

      expect(cache.get<string>("key-a")).toBe("alpha");
      expect(cache.get<string>("key-b")).toBe("bravo");
      expect(cache.get<string>("key-c")).toBe("charlie");
    });

    test("similar key names should remain distinct", () => {
      cache.set("query:test", "result-1");
      cache.set("query:test:limit=5", "result-2");
      cache.set("query:testing", "result-3");

      expect(cache.get<string>("query:test")).toBe("result-1");
      expect(cache.get<string>("query:test:limit=5")).toBe("result-2");
      expect(cache.get<string>("query:testing")).toBe("result-3");
    });

    test("same query with different options should use different cache keys", () => {
      // Simulate how a search cache would differentiate queries with different options
      const baseQuery = "typescript orm";
      const key1 = `${baseQuery}:limit=5`;
      const key2 = `${baseQuery}:limit=10`;
      const key3 = `${baseQuery}:limit=5:raw=true`;

      cache.set(key1, { items: ["a"] });
      cache.set(key2, { items: ["a", "b"] });
      cache.set(key3, { items: ["a"], raw: true });

      expect(cache.get(key1)).toEqual({ items: ["a"] });
      expect(cache.get(key2)).toEqual({ items: ["a", "b"] });
      expect(cache.get(key3)).toEqual({ items: ["a"], raw: true });
    });
  });

  describe("clear", () => {
    test("should remove all entries", () => {
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      cache.clear();

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBeUndefined();
    });

    test("should work on an already empty cache", () => {
      cache.clear();
      expect(cache.get("anything")).toBeUndefined();
    });
  });

  describe("prune", () => {
    test("should remove expired entries", async () => {
      cache.set("expired-1", "gone", 1);
      cache.set("expired-2", "also gone", 1);
      cache.set("alive", "still here", 60_000);

      await new Promise((resolve) => setTimeout(resolve, 10));

      cache.prune();

      // Expired entries should be gone
      expect(cache.get("expired-1")).toBeUndefined();
      expect(cache.get("expired-2")).toBeUndefined();
      // Non-expired entry should remain
      expect(cache.get<string>("alive")).toBe("still here");
    });

    test("should be a no-op when no entries are expired", () => {
      cache.set("a", "val-a", 60_000);
      cache.set("b", "val-b", 60_000);

      cache.prune();

      expect(cache.get<string>("a")).toBe("val-a");
      expect(cache.get<string>("b")).toBe("val-b");
    });

    test("should be a no-op on an empty cache", () => {
      // Should not throw
      cache.prune();
    });

    test("should remove all entries when all are expired", async () => {
      cache.set("x", 1, 1);
      cache.set("y", 2, 1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      cache.prune();

      expect(cache.get("x")).toBeUndefined();
      expect(cache.get("y")).toBeUndefined();
    });
  });

  describe("expired entry cleanup on get", () => {
    test("should lazily delete an expired entry when accessed via get", async () => {
      cache.set("lazy-expire", "value", 1);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // First get triggers deletion and returns undefined
      const result = cache.get("lazy-expire");
      expect(result).toBeUndefined();

      // Setting a new value for the same key should work normally after deletion
      cache.set("lazy-expire", "new value", 60_000);
      expect(cache.get<string>("lazy-expire")).toBe("new value");
    });
  });
});
