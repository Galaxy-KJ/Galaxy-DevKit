/**
 * @fileoverview Price cache implementation
 * @description In-memory cache with TTL for price data
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData, CacheConfig, AggregatedPrice } from '../types/oracle-types';

/**
 * Cache entry
 * @interface CacheEntry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
}

/**
 * Default cache configuration
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlMs: 60000, // 60 seconds
  maxSize: 1000,
  enableFallback: true,
};

/**
 * Price cache class
 * @class PriceCache
 */
export class PriceCache {
  private priceCache: Map<string, CacheEntry<PriceData>>;
  private aggregatedCache: Map<string, CacheEntry<AggregatedPrice>>;
  private config: CacheConfig;
  private accessOrder: string[]; // For LRU eviction

  /**
   * Create a new price cache
   * @param {Partial<CacheConfig>} config - Cache configuration
   */
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.priceCache = new Map();
    this.aggregatedCache = new Map();
    this.accessOrder = [];
  }

  /**
   * Get cache key for symbol
   * @param {string} symbol - Asset symbol
   * @param {string} source - Source name (optional)
   * @returns {string} Cache key
   */
  private getKey(symbol: string, source?: string): string {
    return source ? `${symbol}:${source}` : symbol;
  }

  /**
   * Check if entry is expired
   * @param {CacheEntry<T>} entry - Cache entry
   * @returns {boolean} True if expired
   */
  private isExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt.getTime();
  }

  /**
   * Evict oldest entries if cache is full
   * @param {Map<string, CacheEntry<any>>} cache - Cache map
   */
  private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size < this.config.maxSize) {
      return;
    }

    // Remove oldest entries (LRU)
    const entriesToRemove = cache.size - this.config.maxSize + 1;
    const sortedKeys = this.accessOrder
      .filter((key) => cache.has(key))
      .slice(0, entriesToRemove);

    for (const key of sortedKeys) {
      cache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
  }

  /**
   * Update access order for LRU
   * @param {string} key - Cache key
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Get cached price data
   * @param {string} symbol - Asset symbol
   * @param {string} source - Source name (optional)
   * @returns {PriceData | null} Cached price or null
   */
  getPrice(symbol: string, source?: string): PriceData | null {
    const key = this.getKey(symbol, source);
    const entry = this.priceCache.get(key);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.priceCache.delete(key);
      return null;
    }

    this.updateAccessOrder(key);
    return entry.data;
  }

  /**
   * Set cached price data
   * @param {PriceData} price - Price data to cache
   */
  setPrice(price: PriceData): void {
    const key = this.getKey(price.symbol, price.source);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlMs);

    this.evictIfNeeded(this.priceCache);

    this.priceCache.set(key, {
      data: price,
      timestamp: now,
      expiresAt,
    });

    this.updateAccessOrder(key);
  }

  /**
   * Get cached aggregated price
   * @param {string} symbol - Asset symbol
   * @returns {AggregatedPrice | null} Cached aggregated price or null
   */
  getAggregatedPrice(symbol: string): AggregatedPrice | null {
    const entry = this.aggregatedCache.get(symbol);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.aggregatedCache.delete(symbol);
      return null;
    }

    this.updateAccessOrder(symbol);
    return entry.data;
  }

  /**
   * Set cached aggregated price
   * @param {AggregatedPrice} aggregatedPrice - Aggregated price to cache
   */
  setAggregatedPrice(aggregatedPrice: AggregatedPrice): void {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.ttlMs);

    this.evictIfNeeded(this.aggregatedCache);

    this.aggregatedCache.set(aggregatedPrice.symbol, {
      data: aggregatedPrice,
      timestamp: now,
      expiresAt,
    });

    this.updateAccessOrder(aggregatedPrice.symbol);
  }

  /**
   * Invalidate cache for a symbol
   * @param {string} symbol - Asset symbol
   * @param {string} source - Source name (optional, invalidates all sources if not provided)
   */
  invalidate(symbol: string, source?: string): void {
    if (source) {
      const key = this.getKey(symbol, source);
      this.priceCache.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    } else {
      // Invalidate all entries for this symbol
      const keysToDelete: string[] = [];
      for (const key of this.priceCache.keys()) {
        if (key.startsWith(`${symbol}:`) || key === symbol) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.priceCache.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
      }
      this.aggregatedCache.delete(symbol);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.priceCache.clear();
    this.aggregatedCache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   * @returns {{ priceCount: number; aggregatedCount: number; totalSize: number }} Cache stats
   */
  getStats(): {
    priceCount: number;
    aggregatedCount: number;
    totalSize: number;
  } {
    return {
      priceCount: this.priceCache.size,
      aggregatedCount: this.aggregatedCache.size,
      totalSize: this.priceCache.size + this.aggregatedCache.size,
    };
  }
}
