/**
 * @fileoverview Tests for median strategy
 * @description Unit tests for median aggregation strategy
 */

import { MedianStrategy } from '../../src/aggregator/strategies/MedianStrategy.js';
import { PriceData } from '../../src/types/oracle-types.js';

describe('MedianStrategy', () => {
  let strategy: MedianStrategy;

  beforeEach(() => {
    strategy = new MedianStrategy();
  });

  describe('getName', () => {
    it('should return strategy name', () => {
      expect(strategy.getName()).toBe('median');
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

    it('should calculate median for odd number of prices', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
      ];
      expect(strategy.aggregate(prices)).toBe(200);
    });

    it('should calculate median for even number of prices', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
        createPrice(400, 'source4'),
      ];
      expect(strategy.aggregate(prices)).toBe(250); // (200 + 300) / 2
    });

    it('should handle unsorted prices', () => {
      const prices = [
        createPrice(300, 'source1'),
        createPrice(100, 'source2'),
        createPrice(200, 'source3'),
      ];
      expect(strategy.aggregate(prices)).toBe(200);
    });

    it('should ignore weights parameter', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(200, 'source2'),
        createPrice(300, 'source3'),
      ];
      const weights = new Map([
        ['source1', 10],
        ['source2', 1],
        ['source3', 1],
      ]);
      // Median should still be 200, not weighted
      expect(strategy.aggregate(prices, weights)).toBe(200);
    });
  });
});
