/**
 * @fileoverview Median aggregation strategy
 * @description Aggregates prices using median value
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData } from '../../types/oracle-types';
import { AggregationStrategy } from './AggregationStrategy';

/**
 * Median aggregation strategy
 * Uses median price after sorting all prices
 * @class MedianStrategy
 * @implements {AggregationStrategy}
 */
export class MedianStrategy implements AggregationStrategy {
  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName(): string {
    return 'median';
  }

  /**
   * Aggregate prices using median
   * @param {PriceData[]} prices - Array of price data
   * @param {Map<string, number>} weights - Weights are ignored for median strategy
   * @returns {number} Median price
   */
  aggregate(prices: PriceData[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    if (prices.length === 1) {
      return prices[0].price;
    }

    // Sort prices
    const sortedPrices = [...prices]
      .map((p) => p.price)
      .sort((a, b) => a - b);

    // Calculate median
    const mid = Math.floor(sortedPrices.length / 2);

    if (sortedPrices.length % 2 === 0) {
      // Even number of prices: average of two middle values
      return (sortedPrices[mid - 1] + sortedPrices[mid]) / 2;
    }

    // Odd number of prices: middle value
    return sortedPrices[mid];
  }
}
