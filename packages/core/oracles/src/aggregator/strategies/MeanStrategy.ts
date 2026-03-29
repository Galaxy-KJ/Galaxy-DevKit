/**
 * @fileoverview Mean aggregation strategy
 * @description Aggregates prices using simple arithmetic mean (average)
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import { PriceData } from '../../types/oracle-types.js';
import { AggregationStrategy } from './AggregationStrategy.js';

/**
 * Mean aggregation strategy
 * Uses simple arithmetic mean of all prices
 * @class MeanStrategy
 * @implements {AggregationStrategy}
 */
export class MeanStrategy implements AggregationStrategy {
  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName(): string {
    return 'mean';
  }

  /**
   * Aggregate prices using arithmetic mean
   * @param {PriceData[]} prices - Array of price data
   * @param {Map<string, number>} weights - Weights are ignored for mean strategy
   * @returns {number} Mean price
   */
  aggregate(prices: PriceData[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    if (prices.length === 1) {
      return prices[0].price;
    }

    const sum = prices.reduce((acc, p) => acc + p.price, 0);
    return sum / prices.length;
  }
}
