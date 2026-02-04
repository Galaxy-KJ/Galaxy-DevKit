/**
 * @fileoverview Tests for price cache
 * @description Unit tests for price caching functionality
 */

import { PriceCache } from '../../src/cache/price-cache.js';
import { PriceData, AggregatedPrice } from '../../src/types/oracle-types.js';

describe('PriceCache', () => {
  let cache: PriceCache;

  beforeEach(() => {
    cache = new PriceCache({ ttlMs: 1000, maxSize: 10 });
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
});
