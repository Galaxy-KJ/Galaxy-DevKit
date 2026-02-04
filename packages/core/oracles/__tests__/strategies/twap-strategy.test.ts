/**
 * @fileoverview Tests for TWAP strategy
 * @description Unit tests for time-weighted average price strategy
 */

import { TWAPStrategy } from '../../src/aggregator/strategies/TWAPStrategy.js';
import { PriceCache } from '../../src/cache/price-cache.js';
import { PriceData } from '../../src/types/oracle-types.js';

describe('TWAPStrategy', () => {
  let strategy: TWAPStrategy;
  let cache: PriceCache;

  beforeEach(() => {
    cache = new PriceCache({ ttlMs: 60000 });
    strategy = new TWAPStrategy(cache, 60000); // 60 second window
  });

  describe('getName', () => {
    it('should return strategy name', () => {
      expect(strategy.getName()).toBe('twap');
    });
  });

  describe('aggregate', () => {
    const createPrice = (
      price: number,
      source: string,
      ageMs: number = 0
    ): PriceData => ({
      symbol: 'XLM',
      price,
      timestamp: new Date(Date.now() - ageMs),
      source,
    });

    it('should throw error for empty array', () => {
      expect(() => strategy.aggregate([])).toThrow(
        'Cannot aggregate empty price array'
      );
    });

    it('should return single price', () => {
      const prices = [createPrice(100, 'source1')];
      expect(strategy.aggregate(prices)).toBe(100);
    });

    it('should weight recent prices higher', () => {
      const prices = [
        createPrice(100, 'source1', 0), // Most recent
        createPrice(200, 'source2', 30000), // 30 seconds old
        createPrice(300, 'source3', 60000), // 60 seconds old (at edge)
      ];
      const result = strategy.aggregate(prices);
      // Recent price should have more weight
      expect(result).toBeLessThan(200); // Closer to 100 than 200
    });

    it('should exclude prices outside time window', () => {
      const prices = [
        createPrice(100, 'source1', 0),
        createPrice(200, 'source2', 70000), // Outside window
      ];
      const result = strategy.aggregate(prices);
      // Should only use source1
      expect(result).toBe(100);
    });

    it('should combine time weights with source weights', () => {
      const prices = [
        createPrice(100, 'source1', 0),
        createPrice(200, 'source2', 0),
      ];
      const weights = new Map([
        ['source1', 0.75],
        ['source2', 0.25],
      ]);
      const result = strategy.aggregate(prices, weights);
      // Should be weighted: 100 * 0.75 + 200 * 0.25 = 125
      expect(result).toBe(125);
    });

    it('should fallback to simple average if all weights are zero', () => {
      const prices = [
        createPrice(100, 'source1', 70000), // Outside window
        createPrice(200, 'source2', 70000), // Outside window
        createPrice(300, 'source3', 70000), // Outside window
      ];
      const result = strategy.aggregate(prices);
      // Should fallback to average of all prices when all are outside window
      expect(result).toBe(200); // (100 + 200 + 300) / 3
    });
  });
});
