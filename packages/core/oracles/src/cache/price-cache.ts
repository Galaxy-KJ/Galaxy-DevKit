/**
 * @fileoverview Price cache implementation delegating to unified globalCache
 * @description Price cache using the DevKit unified caching singleton under the hood
 * @author Galaxy DevKit Team
 * @version 2.1.0
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

  /**
   * PriceCache is a thin wrapper around the process-wide `oracle-price`
   * channel on `globalCache` — every PriceCache instance shares the same
   * underlying cache by design, which is what lets one aggregator's write
   * be visible to another PriceCache elsewhere in the process. It does
   * not own a private cache of its own.
   *
   * Passing `maxSize`/`ttlMs` here reconfigures that shared channel
   * through `globalCache.configure(...)` (the public API — see
   * cache-manager.ts). This is non-destructive: `configure` resizes the
   * existing cache in place rather than replacing it, so entries already
   * written by other PriceCache instances (or anything else using the
   * `oracle-price` channel) survive. Constructing a second
   * `PriceCache({ maxSize })` is therefore safe and effectively
   * idempotent — the last config applied wins for the channel's
   * TTL/size going forward, but no existing entry is dropped as a side
   * effect of construction. Shrinking `maxSize` below the current entry
   * count still evicts the minimum needed via the channel's normal
   * oldest-first eviction policy, exactly as a normal cache write would.
   */
  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };

    if (config.maxSize !== undefined || config.ttlMs !== undefined) {
      globalCache.configure('oracle-price', {
        ...(config.maxSize !== undefined ? { maxSize: config.maxSize } : {}),
        ...(config.ttlMs !== undefined ? { ttlMs: config.ttlMs } : {}),
      });
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
      cache.deleteSync(this.getKey(symbol, source));
      return;
    }

    // Invalidate every source-scoped entry for this symbol
    // (oracle:symbol:*), the bare per-symbol key (oracle:symbol), and the
    // aggregated entry — all through the public API.
    globalCache.deleteByPrefix('oracle-price', `oracle:${symbol}:`);
    cache.deleteSync(`oracle:${symbol}`);
    cache.deleteSync(`oracle:aggregated:${symbol}`);
  }

  clear(): void {
    // Wipe only entries belonging to this namespace (oracle:), not the
    // whole shared channel.
    globalCache.deleteByPrefix('oracle-price', 'oracle:');
  }

  getStats(): {
    priceCount: number;
    aggregatedCount: number;
    totalSize: number;
  } {
    const cache = globalCache.getCache('oracle-price');
    let priceCount = 0;
    let aggregatedCount = 0;

    for (const key of cache.keys()) {
      if (key.startsWith('oracle:aggregated:')) {
        aggregatedCount++;
      } else if (key.startsWith('oracle:')) {
        priceCount++;
      }
    }

    return {
      priceCount,
      aggregatedCount,
      totalSize: priceCount + aggregatedCount,
    };
  }
}