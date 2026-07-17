/**
 * @fileoverview Caching manager to orchestrate different caching channels and backends
 * @description Supports configurable TTLs, manual/event/time-based invalidation, cache warming, and metrics.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-15
 */

import { EventEmitter } from 'events';
import { ICache, CacheOptions, CacheStats } from './cache-interface.js';
import { InMemoryCache } from './in-memory-cache.js';

export interface ChannelConfig {
  ttlMs: number;
  staleWhileRevalidate: boolean;
  swrTtlMs: number;
  maxSize: number;
}

export type CacheType = 'oracle-price' | 'account-balance' | 'defi-pool' | 'horizon-response' | 'static-data';

export const DEFAULT_CHANNEL_CONFIGS: Record<CacheType, ChannelConfig> = {
  'oracle-price': {
    ttlMs: 15000, // 15s (short TTL)
    staleWhileRevalidate: true,
    swrTtlMs: 30000,
    maxSize: 1000,
  },
  'account-balance': {
    ttlMs: 30000, // 30s (medium TTL)
    staleWhileRevalidate: true,
    swrTtlMs: 60000,
    maxSize: 1000,
  },
  'defi-pool': {
    ttlMs: 60000, // 60s TTL
    staleWhileRevalidate: true,
    swrTtlMs: 120000,
    maxSize: 500,
  },
  'horizon-response': {
    ttlMs: 30000, // 30s TTL
    staleWhileRevalidate: true,
    swrTtlMs: 60000,
    maxSize: 2000,
  },
  'static-data': {
    ttlMs: 24 * 60 * 60 * 1000, // 24h TTL (long TTL)
    staleWhileRevalidate: false,
    swrTtlMs: 0,
    maxSize: 500,
  },
};

export class CacheManager {
  private caches: Map<CacheType, InMemoryCache>;
  private configs: Record<CacheType, ChannelConfig>;
  public events: EventEmitter;

  constructor(configs: Partial<Record<CacheType, Partial<ChannelConfig>>> = {}) {
    this.caches = new Map();
    this.configs = {} as Record<CacheType, ChannelConfig>;
    this.events = new EventEmitter();

    // Set up configs and initialize caches
    for (const key of Object.keys(DEFAULT_CHANNEL_CONFIGS) as CacheType[]) {
      const mergedConfig = {
        ...DEFAULT_CHANNEL_CONFIGS[key],
        ...(configs[key] || {}),
      };
      this.configs[key] = mergedConfig;
      this.caches.set(key, new InMemoryCache(mergedConfig.maxSize));
    }

    // Hook up event listeners for cache invalidation
    this.events.on('newPriceFeed', (symbol: string) => {
      void this.invalidate('oracle-price', symbol);
      void this.invalidate('oracle-price', `aggregated:${symbol}`);
    });

    this.events.on('transaction', (publicKey: string) => {
      void this.invalidate('account-balance', `balance:${publicKey}:*`);
      void this.invalidate('horizon-response', `account-info:${publicKey}`);
      void this.invalidate('horizon-response', `tx-history:${publicKey}`);
    });
  }

  getCache(type: CacheType): InMemoryCache {
    const cache = this.caches.get(type);
    if (!cache) {
      throw new Error(`Cache type ${type} not initialized`);
    }
    return cache;
  }

  async getOrFetch<T>(
    type: CacheType,
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    const cache = this.getCache(type);
    const config = this.configs[type];

    const mergedOptions: CacheOptions = {
      ttlMs: options?.ttlMs ?? config.ttlMs,
      staleWhileRevalidate: options?.staleWhileRevalidate ?? config.staleWhileRevalidate,
      swrTtlMs: options?.swrTtlMs ?? config.swrTtlMs,
    };

    return cache.getOrFetch(key, fetchFn, mergedOptions);
  }

  async set<T>(type: CacheType, key: string, value: T, options?: CacheOptions): Promise<void> {
    const cache = this.getCache(type);
    const config = this.configs[type];

    const mergedOptions: CacheOptions = {
      ttlMs: options?.ttlMs ?? config.ttlMs,
    };

    await cache.set(key, value, mergedOptions);
  }

  async get<T>(type: CacheType, key: string): Promise<T | null> {
    const cache = this.getCache(type);
    return cache.get(key);
  }

  async invalidate(type: CacheType, keyPattern: string): Promise<void> {
    const cache = this.getCache(type);
    if (keyPattern.endsWith('*')) {
      const prefix = keyPattern.slice(0, -1);
      // Accessing internal map for pattern invalidation
      const internalCacheMap = (cache as any).cache;
      if (internalCacheMap instanceof Map) {
        for (const key of internalCacheMap.keys()) {
          if (key.startsWith(prefix)) {
            await cache.delete(key);
          }
        }
      }
    } else {
      await cache.delete(keyPattern);
    }
  }

  async clear(): Promise<void> {
    for (const cache of this.caches.values()) {
      await cache.clear();
    }
  }

  async getStats(): Promise<Record<CacheType, CacheStats> & { total: CacheStats }> {
    const stats = {} as Record<CacheType, CacheStats>;
    let totalHits = 0;
    let totalMisses = 0;
    let totalKeys = 0;

    for (const [type, cache] of this.caches.entries()) {
      const s = await cache.getStats();
      stats[type] = s;
      totalHits += s.hits;
      totalMisses += s.misses;
      totalKeys += s.keys;
    }

    const total = totalHits + totalMisses;
    const totalHitRate = total === 0 ? 0 : totalHits / total;

    return {
      ...stats,
      total: {
        hits: totalHits,
        misses: totalMisses,
        keys: totalKeys,
        hitRate: totalHitRate,
      },
    };
  }

  async warmCache(networkConfig?: { horizonUrl: string; passphrase?: string }): Promise<void> {
    const horizonUrl = networkConfig?.horizonUrl || process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const passphrase = networkConfig?.passphrase || process.env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015';

    const network = horizonUrl.includes('mainnet') ? 'mainnet' : 'testnet';
    const { StellarService } = await import('../services/stellar-service.js');
    const tempService = new StellarService({ network, horizonUrl, passphrase });

    // 1. Warm static data (Skip mock fallbacks to prevent polluting cache)
    const contractKeys = ['blend-pool', 'blend-oracle', 'blend-backstop', 'blend-emitter', 'soroswap-router', 'soroswap-factory'];
    for (const key of contractKeys) {
      const address = process.env[key.toUpperCase().replace('-', '_') + '_ADDRESS'];
      if (address) {
        await this.getOrFetch('static-data', `contract:${key}`, async () => address);
      }
    }

    // 2. Warm oracle prices for major assets (Skip hardcoded prices, fetch from service if possible)
    // In this repo, oracle-prices are normally populated by price feeds dynamically.
    // We only warm from Stellar Service or Oracle Aggregator if configured.

    // 3. Warm accounts if configured
    const testPublicKey = process.env.TEST_PUBLIC_KEY;
    if (testPublicKey) {
      await this.getOrFetch('horizon-response', `account-info:${testPublicKey}`, async () => {
        return tempService.getAccountInfo(testPublicKey);
      });
      await this.getOrFetch('account-balance', `balance:${testPublicKey}:XLM`, async () => {
        return tempService.getBalance(testPublicKey, 'XLM');
      });
    }
  }
}

// Export a global singleton instance
export const globalCache = new CacheManager();
