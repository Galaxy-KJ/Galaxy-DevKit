/**
 * @fileoverview Caching interfaces for unified caching layer
 * @description Defines the cache interface, entry structure, options, and metrics stats.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-15
 */

export interface CacheEntry<T> {
  value: T;
  createdAt: number;
  expiresAt: number;
}

export interface CacheOptions {
  ttlMs?: number;
  staleWhileRevalidate?: boolean;
  swrTtlMs?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  hitRate: number;
}

export interface ICache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
}
