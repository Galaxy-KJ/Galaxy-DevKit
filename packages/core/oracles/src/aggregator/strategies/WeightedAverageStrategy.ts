/**
 * @fileoverview Weighted average aggregation strategy
 * @description Aggregates prices using weighted average
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData } from '../../types/oracle-types';
import { AggregationStrategy } from './AggregationStrategy';

/**
 * Weighted average aggregation strategy
 * Uses weighted average based on source weights
 * @class WeightedAverageStrategy
 * @implements {AggregationStrategy}
 */
export class WeightedAverageStrategy implements AggregationStrategy {
  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName(): string {
    return 'weighted_average';
  }

  /**
   * Normalize weights so they sum to 1
   * @param {Map<string, number>} weights - Source weights
   * @param {PriceData[]} prices - Price data
   * @returns {Map<string, number>} Normalized weights
   */
  private normalizeWeights(
    weights: Map<string, number>,
    prices: PriceData[]
  ): Map<string, number> {
    const normalized = new Map<string, number>();

    // Calculate total weight for available sources
    let totalWeight = 0;
    for (const price of prices) {
      const weight = weights.get(price.source) || 1.0;
      totalWeight += weight;
    }

    // Normalize weights
    if (totalWeight > 0) {
      for (const price of prices) {
        const weight = weights.get(price.source) || 1.0;
        normalized.set(price.source, weight / totalWeight);
      }
    } else {
      // Equal weights if no weights provided or total is 0
      const equalWeight = 1.0 / prices.length;
      for (const price of prices) {
        normalized.set(price.source, equalWeight);
      }
    }

    return normalized;
  }

  /**
   * Aggregate prices using weighted average
   * @param {PriceData[]} prices - Array of price data
   * @param {Map<string, number>} weights - Optional source weights
   * @returns {number} Weighted average price
   */
  aggregate(prices: PriceData[], weights?: Map<string, number>): number {
    if (prices.length === 0) {
      throw new Error('Cannot aggregate empty price array');
    }

    if (prices.length === 1) {
      return prices[0].price;
    }

    // Use equal weights if not provided
    const sourceWeights = weights || new Map<string, number>();
    const normalizedWeights = this.normalizeWeights(sourceWeights, prices);

    // Calculate weighted average
    let weightedSum = 0;
    for (const price of prices) {
      const weight = normalizedWeights.get(price.source) || 0;
      weightedSum += price.price * weight;
    }

    return weightedSum;
  }
}
