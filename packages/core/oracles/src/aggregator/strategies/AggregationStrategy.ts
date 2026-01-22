/**
 * @fileoverview Aggregation strategy interface
 * @description Base interface for price aggregation strategies
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData } from '../../types/oracle-types';

/**
 * Aggregation strategy interface
 * @interface AggregationStrategy
 */
export interface AggregationStrategy {
  /**
   * Aggregate prices using the strategy
   * @param {PriceData[]} prices - Array of price data
   * @param {Map<string, number>} weights - Optional source weights
   * @returns {number} Aggregated price
   */
  aggregate(prices: PriceData[], weights?: Map<string, number>): number;

  /**
   * Get strategy name
   * @returns {string} Strategy name
   */
  getName(): string;
}
