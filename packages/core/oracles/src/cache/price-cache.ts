/**
 * @fileoverview Price cache implementation delegating to unified globalCache
 * @description Price cache using the DevKit unified caching singleton under the hood
 * @author Galaxy DevKit Team
 * @version 2.0.0
 * @since 2026-07-15
 */

import { PriceData, CacheConfig, AggregatedPrice } from '../types/oracle-types.js';
import { globalCache } from '@galaxy-kj/core-stellar-sdk';

const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttlMs: 60000, // 60 seconds
  maxSize: 1000,
  enableFallback: true,
};

export class PriceCache {
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    // If a custom maxSize is provided, configure the oracle-price channel on globalCache
    if (config.maxSize !== undefined || config.ttlMs !== undefined) {
      const existing = (globalCache as any).configs['oracle-price'] || {};
      const newConfig = {
        ...existing,
        ...(config.maxSize !== undefined ? { maxSize: config.maxSize } : {}),
        ...(config.ttlMs !== undefined ? { ttlMs: config.ttlMs } : {}),
      };
      (globalCache as any).configs['oracle-price'] = newConfig;
      // Re-instantiate cache with the updated maxSize
      if (config.maxSize !== undefined) {
        (globalCache as any).caches.set('oracle-price', new (globalCache.getCache('oracle-price').constructor as any)(config.maxSize));
      }
    }
  }

  private getKey(symbol: string, source?: string): string {
    const rawKey = source ? `${symbol}:${source}` : symbol;
    return `oracle:${rawKey}`;
  }

  getPrice(symbol: string, source?: string): PriceData | null {
    const key = this.getKey(symbol, source);
    const cache = globalCache.getCache('oracle-price');
    return cache.getSync<PriceData>(key);
  }

  setPrice(price: PriceData): void {
    const key = this.getKey(price.symbol, price.source);
    const cache = globalCache.getCache('oracle-price');
    cache.setSync(key, price, { ttlMs: this.config.ttlMs });
  }

  getAggregatedPrice(symbol: string): AggregatedPrice | null {
    const cache = globalCache.getCache('oracle-price');
    return cache.getSync<AggregatedPrice>(`oracle:aggregated:${symbol}`);
  }

  setAggregatedPrice(aggregatedPrice: AggregatedPrice): void {
    const cache = globalCache.getCache('oracle-price');
    cache.setSync(`oracle:aggregated:${aggregatedPrice.symbol}`, aggregatedPrice, { ttlMs: this.config.ttlMs });
  }

  invalidate(symbol: string, source?: string): void {
    const cache = globalCache.getCache('oracle-price');
    if (source) {
      const key = this.getKey(symbol, source);
      cache.deleteSync(key);
    } else {
      // Invalidate all entries starting with oracle:symbol: or equal to oracle:symbol
      const internalCacheMap = (cache as any).cache;
      if (internalCacheMap instanceof Map) {
        const keysToDelete: string[] = [];
        for (const key of internalCacheMap.keys()) {
          if (key.startsWith(`oracle:${symbol}:`) || key === `oracle:${symbol}`) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          cache.deleteSync(key);
        }
      }
      cache.deleteSync(`oracle:aggregated:${symbol}`);
    }
  }

  clear(): void {
    const cache = globalCache.getCache('oracle-price');
    // Wipe only entries belonging to this namespace (oracle:)
    const internalCacheMap = (cache as any).cache;
    if (internalCacheMap instanceof Map) {
      const keysToDelete: string[] = [];
      for (const key of internalCacheMap.keys()) {
        if (key.startsWith('oracle:')) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        cache.deleteSync(key);
      }
    }
  }

  getStats(): {
    priceCount: number;
    aggregatedCount: number;
    totalSize: number;
  } {
    const cache = globalCache.getCache('oracle-price');
    const internalCacheMap = (cache as any).cache;
    let priceCount = 0;
    let aggregatedCount = 0;

    if (internalCacheMap instanceof Map) {
      for (const key of internalCacheMap.keys()) {
        if (key.startsWith('oracle:')) {
          if (key.startsWith('oracle:aggregated:')) {
            aggregatedCount++;
          } else {
            priceCount++;
          }
        }
      }
    }

    return {
      priceCount,
      aggregatedCount,
      totalSize: priceCount + aggregatedCount,
    };
  }
}
