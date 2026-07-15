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
  }

  private getKey(symbol: string, source?: string): string {
    return source ? `${symbol}:${source}` : symbol;
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
    return cache.getSync<AggregatedPrice>(`aggregated:${symbol}`);
  }

  setAggregatedPrice(aggregatedPrice: AggregatedPrice): void {
    const cache = globalCache.getCache('oracle-price');
    cache.setSync(`aggregated:${aggregatedPrice.symbol}`, aggregatedPrice, { ttlMs: this.config.ttlMs });
  }

  invalidate(symbol: string, source?: string): void {
    const cache = globalCache.getCache('oracle-price');
    if (source) {
      const key = this.getKey(symbol, source);
      cache.deleteSync(key);
    } else {
      // Invalidate all entries starting with symbol:
      const internalCacheMap = (cache as any).cache;
      if (internalCacheMap instanceof Map) {
        const keysToDelete: string[] = [];
        for (const key of internalCacheMap.keys()) {
          if (key.startsWith(`${symbol}:`) || key === symbol) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          cache.deleteSync(key);
        }
      }
      cache.deleteSync(`aggregated:${symbol}`);
    }
  }

  clear(): void {
    const cache = globalCache.getCache('oracle-price');
    void cache.clear();
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
        if (key.startsWith('aggregated:')) {
          aggregatedCount++;
        } else {
          priceCount++;
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
