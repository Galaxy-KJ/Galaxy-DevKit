/**
 * @fileoverview In-memory cache implementation
 * @description Map-based in-memory cache supporting LRU eviction, request deduplication,
 *              cache stampede prevention (promise coalescing), and Stale-While-Revalidate (SWR).
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-15
 */

import { ICache, CacheOptions, CacheStats, CacheEntry } from './cache-interface.js';

export class InMemoryCache implements ICache {
  private cache: Map<string, CacheEntry<any>>;
  private pendingPromises: Map<string, Promise<any>>;
  private hits: number;
  private misses: number;
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.pendingPromises = new Map();
    this.hits = 0;
    this.misses = 0;
    this.maxSize = maxSize;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    // Move to end for LRU eviction (re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as T;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const ttl = options?.ttlMs ?? 60000;
    const now = Date.now();
    const expiresAt = now + ttl;

    // Eviction if exceeds maxSize
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    // Insert or update
    this.cache.delete(key);
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.pendingPromises.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.pendingPromises.clear();
    this.hits = 0;
    this.misses = 0;
  }

  async getStats(): Promise<CacheStats> {
    const total = this.hits + this.misses;
    const hitRate = total === 0 ? 0 : this.hits / total;
    return {
      hits: this.hits,
      misses: this.misses,
      keys: this.cache.size,
      hitRate,
    };
  }

  getSync<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    // Move to end for LRU eviction
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value as T;
  }

  setSync<T>(key: string, value: T, options?: CacheOptions): void {
    const ttl = options?.ttlMs ?? 60000;
    const now = Date.now();
    const expiresAt = now + ttl;

    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.delete(key);
    this.cache.set(key, {
      value,
      createdAt: now,
      expiresAt,
    });
  }

  deleteSync(key: string): void {
    this.cache.delete(key);
    this.pendingPromises.delete(key);
  }

  /**
   * Request deduplication, stampede prevention, and Stale-While-Revalidate wrapper.
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key);

    const ttl = options?.ttlMs ?? 60000;
    const swrTtl = options?.swrTtlMs ?? (ttl * 2); // Default revalidation window is double the TTL
    const staleWhileRevalidate = options?.staleWhileRevalidate ?? false;

    if (entry) {
      const isExpired = now > entry.expiresAt;
      const isInSwrWindow = now <= (entry.createdAt + swrTtl);

      if (!isExpired) {
        this.hits++;
        // Move to end for LRU
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value as T;
      }

      if (staleWhileRevalidate && isInSwrWindow) {
        this.hits++; // Considered a hit for the caller
        
        // Trigger revalidation in background
        if (!this.pendingPromises.has(key)) {
          const fetchPromise = fetchFn()
            .then(async (freshValue) => {
              await this.set(key, freshValue, options);
              this.pendingPromises.delete(key);
              return freshValue;
            })
            .catch((err) => {
              console.error(`[InMemoryCache] Background revalidation failed for key ${key}:`, err);
              this.pendingPromises.delete(key);
            });
          // Do not await, run in background
        }
        
        return entry.value as T;
      }

      // Fully expired
      this.cache.delete(key);
    }

    this.misses++;

    // Cache stampede prevention: share the same fetch promise
    let promise = this.pendingPromises.get(key);
    if (!promise) {
      promise = fetchFn()
        .then(async (freshValue) => {
          await this.set(key, freshValue, options);
          this.pendingPromises.delete(key);
          return freshValue;
        })
        .catch((err) => {
          this.pendingPromises.delete(key);
          throw err;
        });
      this.pendingPromises.set(key, promise);
    }

    return promise;
  }
}
