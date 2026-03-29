/**
 * @fileoverview Tests for weighted average strategy
 * @description Unit tests for weighted average aggregation strategy
 */

import { WeightedAverageStrategy } from '../../src/aggregator/strategies/WeightedAverageStrategy.js';
import { PriceData } from '../../src/types/oracle-types.js';

describe('WeightedAverageStrategy', () => {
  let strategy: WeightedAverageStrategy;

  beforeEach(() => {
    strategy = new WeightedAverageStrategy();
  });

  describe('getName', () => {
    it('should return strategy name', () => {
      expect(strategy.getName()).toBe('weighted_average');
    });
  });

  describe('aggregate', () => {
    const createPrice = (price: number, source: string): PriceData => ({
      symbol: 'XLM',
      price,
      timestamp: new Date(),
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

    it('should calculate simple average when no weights provided', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
      ];
      const result = strategy.aggregate(prices);
      expect(result).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should calculate weighted average with weights', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
      ];
      const weights = new Map([
        ['source1', 0.75],
        ['source2', 0.25],
      ]);
      const result = strategy.aggregate(prices, weights);
      // 100 * 0.75 + 200 * 0.25 = 75 + 50 = 125
      expect(result).toBe(125);
    });

    it('should normalize weights automatically', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
      ];
      const weights = new Map([
        ['source1', 3], // Will be normalized to 0.75
        ['source2', 1], // Will be normalized to 0.25
      ]);
      const result = strategy.aggregate(prices, weights);
      expect(result).toBe(125);
    });

    it('should handle unequal weights', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
      ];
      const weights = new Map([
        ['source1', 0.5],
        ['source2', 0.3],
        ['source3', 0.2],
      ]);
      const result = strategy.aggregate(prices, weights);
      // 100 * 0.5 + 200 * 0.3 + 300 * 0.2 = 50 + 60 + 60 = 170
      expect(result).toBe(170);
    });

    it('should use equal weights for sources without weights', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
      ];
      const weights = new Map([
        ['source1', 0.5],
        // source2 and source3 will get equal weights
      ]);
      const result = strategy.aggregate(prices, weights);
      // Weights will be normalized: source1 gets 0.5, source2 and source3 share remaining 0.5
      expect(result).toBeGreaterThan(100);
      expect(result).toBeLessThan(300);
    });
  });
});
