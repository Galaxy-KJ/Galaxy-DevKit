/**
 * @fileoverview Time-weighted average price (TWAP) strategy
 * @description Aggregates prices using time-weighted average
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData } from '../../types/oracle-types.js';
import { AggregationStrategy } from './AggregationStrategy.js';
import { PriceCache } from '../../cache/price-cache.js';

/**
 * Time-weighted average price strategy
 * Uses time-weighted average based on recency of prices
 * @class TWAPStrategy
 * @implements {AggregationStrategy}
 */
export class TWAPStrategy implements AggregationStrategy {
  private cache: PriceCache;
  private timeWindowMs: number;

  /**
   * Create a new TWAP strategy
   * @param {PriceCache} cache - Price cache for historical data
   * @param {number} timeWindowMs - Time window in milliseconds (default: 60000)
   */
  constructor(cache: PriceCache, timeWindowMs: number = 60000) {
    this.cache = cache;
    this.timeWindowMs = timeWindowMs;
  }

  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName(): string {
    return 'twap';
  }

  /**
   * Calculate time weight for a price
   * More recent prices have higher weight
   * @param {PriceData} price - Price data
   * @param {Date} referenceTime - Reference time (usually now)
   * @returns {number} Time weight
   */
  private calculateTimeWeight(price: PriceData, referenceTime: Date): number {
    const age = referenceTime.getTime() - price.timestamp.getTime();

    // If price is outside time window, weight is 0
    if (age > this.timeWindowMs) {
      return 0;
    }

    // Weight decreases linearly with age
    // Most recent price (age = 0) has weight = 1
    // Oldest price (age = timeWindowMs) has weight = 0
    const weight = 1 - age / this.timeWindowMs;
    return Math.max(0, weight);
  }

  /**
   * Aggregate prices using time-weighted average
   * @param {PriceData[]} prices - Array of price data
   * @param {Map<string, number>} weights - Optional source weights (combined with time weights)
   * @returns {number} Time-weighted average price
   */
  aggregate(prices: PriceData[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    if (prices.length === 1) {
      return prices[0].price;
    }

    const now = new Date();
    let totalWeight = 0;
    let weightedSum = 0;

    for (const price of prices) {
      // Calculate time weight
      const timeWeight = this.calculateTimeWeight(price, now);

      // Skip if outside time window
      if (timeWeight === 0) {
        continue;
      }

      // Get source weight if provided
      const sourceWeight = weights?.get(price.source) || 1.0;

      // Combined weight = time weight * source weight
      const combinedWeight = timeWeight * sourceWeight;

      weightedSum += price.price * combinedWeight;
      totalWeight += combinedWeight;
    }

    if (totalWeight === 0) {
      // Fallback to simple average if no valid weights
      const sum = prices.reduce((acc, p) => acc + p.price, 0);
      return sum / prices.length;
    }

    return weightedSum / totalWeight;
  }
}
