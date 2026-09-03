/**
 * @fileoverview Tests for price cache
 * @description Unit tests for price caching functionality
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globalCache, DEFAULT_CHANNEL_CONFIGS } from '@galaxy-kj/core-stellar-sdk';
import { PriceCache } from '../../src/cache/price-cache';
import { PriceData, AggregatedPrice } from '../../src/types/oracle-types.js';

const SOURCE_FILE = path.join(__dirname, '../../src/cache/price-cache.ts');

describe('PriceCache', () => {
  let cache: PriceCache;

  beforeEach(() => {
    cache = new PriceCache({ ttlMs: 1000, maxSize: 10 });
  });

  // PriceCache shares the process-wide 'oracle-price' channel by design
  // (see price-cache.ts's own header comment) — that's what lets one
  // aggregator's write be visible elsewhere. Before the fix for #410,
  // `beforeEach` re-running `new PriceCache({ maxSize: 10 })` above
  // *accidentally* reset that shared cache as a side effect of the bug
  // being fixed here, which is what gave every test in this file a clean
  // slate without anyone writing an explicit teardown for it. Now that
  // reconfiguring is correctly non-destructive, that implicit reset no
  // longer happens, so it needs to be explicit instead.
  afterEach(async () => {
    globalCache.configure('oracle-price', DEFAULT_CHANNEL_CONFIGS['oracle-price']);
    await globalCache.clear();
  });

  describe('getPrice and setPrice', () => {
    it('should cache and retrieve price', () => {
      const price: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };

      cache.setPrice(price);
      const retrieved = cache.getPrice('XLM', 'source1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.price).toBe(100);
      expect(retrieved?.symbol).toBe('XLM');
    });

    it('should return null for non-existent price', () => {
      const retrieved = cache.getPrice('XLM', 'source1');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired price', async () => {
      const price: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };

      cache.setPrice(price);
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait for expiration

      const retrieved = cache.getPrice('XLM', 'source1');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAggregatedPrice and setAggregatedPrice', () => {
    it('should cache and retrieve aggregated price', () => {
      const aggregated: AggregatedPrice = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        confidence: 0.9,
        sourcesUsed: ['source1', 'source2'],
        outliersFiltered: [],
        sourceCount: 2,
      };

      cache.setAggregatedPrice(aggregated);
      const retrieved = cache.getAggregatedPrice('XLM');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.price).toBe(100);
      expect(retrieved?.confidence).toBe(0.9);
    });

    it('should return null for non-existent aggregated price', () => {
      const retrieved = cache.getAggregatedPrice('XLM');
      expect(retrieved).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should invalidate specific source price', () => {
      const price: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };

      cache.setPrice(price);
      cache.invalidate('XLM', 'source1');

      const retrieved = cache.getPrice('XLM', 'source1');
      expect(retrieved).toBeNull();
    });

    it('should invalidate all prices for symbol', () => {
      const price1: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };
      const price2: PriceData = {
        symbol: 'XLM',
        price: 101,
        timestamp: new Date(),
        source: 'source2',
      };

      cache.setPrice(price1);
      cache.setPrice(price2);
      cache.invalidate('XLM');

      expect(cache.getPrice('XLM', 'source1')).toBeNull();
      expect(cache.getPrice('XLM', 'source2')).toBeNull();
    });

    it('should invalidate aggregated price', () => {
      const aggregated: AggregatedPrice = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        confidence: 0.9,
        sourcesUsed: ['source1'],
        outliersFiltered: [],
        sourceCount: 1,
      };

      cache.setAggregatedPrice(aggregated);
      cache.invalidate('XLM');

      expect(cache.getAggregatedPrice('XLM')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all cache', () => {
      const price: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };

      cache.setPrice(price);
      cache.clear();

      expect(cache.getPrice('XLM', 'source1')).toBeNull();
      expect(cache.getStats().totalSize).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const price: PriceData = {
        symbol: 'XLM',
        price: 100,
        timestamp: new Date(),
        source: 'source1',
      };

      cache.setPrice(price);

      const stats = cache.getStats();
      expect(stats.priceCount).toBe(1);
      expect(stats.aggregatedCount).toBe(0);
      expect(stats.totalSize).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when max size reached', () => {
      const cache = new PriceCache({ ttlMs: 60000, maxSize: 3 });

      // Add 4 prices (exceeds max size)
      for (let i = 0; i < 4; i++) {
        const price: PriceData = {
          symbol: `XLM${i}`,
          price: 100 + i,
          timestamp: new Date(),
          source: 'source1',
        };
        cache.setPrice(price);
      }

      const stats = cache.getStats();
      expect(stats.priceCount).toBeLessThanOrEqual(3);
    });
  });

  describe('source contains no `as any` escapes (#410)', () => {
    it('price-cache.ts does not reach into globalCache internals', () => {
      const source = readFileSync(SOURCE_FILE, 'utf8');
      expect(source).not.toMatch(/as\s+any/);
    });
  });

  describe('shared-channel reconfiguration is non-destructive (#410)', () => {
    it('a price written before construction is still readable after a second PriceCache changes maxSize', () => {
      cache.setPrice({ symbol: 'XLM', price: 0.12, timestamp: new Date(), source: 'coingecko' });

      // This used to reach into globalCache's private fields and swap out
      // the live cache instance, silently dropping everything written above.
      const second = new PriceCache({ maxSize: 5000 });

      expect(cache.getPrice('XLM', 'coingecko')?.price).toBe(0.12);
      expect(second.getPrice('XLM', 'coingecko')?.price).toBe(0.12);
    });

    it('constructing several PriceCache instances with different configs never wipes prior entries', () => {
      cache.setPrice({ symbol: 'XLM', price: 0.12, timestamp: new Date(), source: 'coingecko' });

      // eslint-disable-next-line no-new
      new PriceCache({ maxSize: 200 });
      // eslint-disable-next-line no-new
      new PriceCache({ ttlMs: 5000 });
      // eslint-disable-next-line no-new
      new PriceCache({ maxSize: 9000, ttlMs: 10000 });

      expect(cache.getPrice('XLM', 'coingecko')?.price).toBe(0.12);
    });

    it('shrinking maxSize evicts only enough entries to fit, not everything', () => {
      cache.setPrice({ symbol: 'AAA', price: 1, timestamp: new Date(), source: 'coingecko' });
      cache.setPrice({ symbol: 'BBB', price: 2, timestamp: new Date(), source: 'coingecko' });
      cache.setPrice({ symbol: 'CCC', price: 3, timestamp: new Date(), source: 'coingecko' });

      // eslint-disable-next-line no-new
      new PriceCache({ maxSize: 2 });

      const remaining = [
        cache.getPrice('AAA', 'coingecko'),
        cache.getPrice('BBB', 'coingecko'),
        cache.getPrice('CCC', 'coingecko'),
      ].filter((p) => p !== null);

      expect(remaining.length).toBe(2);
      // Oldest write (AAA) is the one evicted by the oldest-first policy.
      expect(cache.getPrice('AAA', 'coingecko')).toBeNull();
      expect(cache.getPrice('CCC', 'coingecko')?.price).toBe(3);
    });
  });
});