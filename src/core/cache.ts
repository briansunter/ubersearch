/**
 * Request Cache for UberSearch
 *
 * Simple in-memory cache with TTL support for caching search results
 */

/**
 * Cache entry with expiration time
 */
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL support
 */
export class SearchCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000;

  /**
   * Get a value from the cache if it exists and hasn't expired
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Set a value in the cache with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Time to live in milliseconds (defaults to 5 minutes)
   */
  set<T>(key: string, value: T, ttlMs = this.DEFAULT_TTL_MS): void {
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from the cache
   */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}
