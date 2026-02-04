/**
 * @fileoverview Price validation utilities
 * @description Validation logic for price data
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData, AggregationConfig } from '../types/oracle-types.js';

/**
 * Default aggregation config
 */
const DEFAULT_CONFIG: AggregationConfig = {
  minSources: 2,
  maxDeviationPercent: 10,
  maxStalenessMs: 60000, // 60 seconds
  enableOutlierDetection: true,
  outlierThreshold: 2.0,
};

/**
 * Check if price data is stale
 * @param {PriceData} price - Price data to check
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {boolean} True if stale
 */
export function checkStaleness(price: PriceData, maxAgeMs: number): boolean {
  const age = Date.now() - price.timestamp.getTime();
  return age > maxAgeMs;
}

/**
 * Validate a single price data
 * @param {PriceData} price - Price data to validate
 * @param {Partial<AggregationConfig>} config - Aggregation configuration
 * @returns {boolean} True if valid
 */
export function validatePrice(
  price: PriceData,
  config: Partial<AggregationConfig> = {}
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check if price is valid number
  if (typeof price.price !== 'number' || !isFinite(price.price) || price.price <= 0) {
    return false;
  }

  // Check if symbol is valid
  if (!price.symbol || typeof price.symbol !== 'string') {
    return false;
  }

  // Check if timestamp is valid
  if (!(price.timestamp instanceof Date) || isNaN(price.timestamp.getTime())) {
    return false;
  }

  // Check staleness
  if (checkStaleness(price, cfg.maxStalenessMs)) {
    return false;
  }

  return true;
}

/**
 * Check if prices meet minimum sources requirement
 * @param {PriceData[]} prices - Array of price data
 * @param {number} minSources - Minimum number of sources required
 * @returns {boolean} True if requirement met
 */
export function requireMinimumSources(
  prices: PriceData[],
  minSources: number
): boolean {
  if (prices.length < minSources) {
    return false;
  }

  // Check unique sources
  const uniqueSources = new Set(prices.map((p) => p.source));
  return uniqueSources.size >= minSources;
}

/**
 * Calculate maximum deviation percentage
 * @param {PriceData[]} prices - Array of price data
 * @returns {number} Maximum deviation percentage
 */
function calculateMaxDeviation(prices: PriceData[]): number {
  if (prices.length === 0) return 0;
  if (prices.length === 1) return 0;

  const values = prices.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  if (avg === 0) return 0;

  const deviation = ((max - min) / avg) * 100;
  return deviation;
}

/**
 * Check if prices exceed maximum deviation
 * @param {PriceData[]} prices - Array of price data
 * @param {number} maxDeviationPercent - Maximum deviation percentage
 * @returns {boolean} True if deviation exceeds limit
 */
export function checkDeviation(
  prices: PriceData[],
  maxDeviationPercent: number
): boolean {
  const deviation = calculateMaxDeviation(prices);
  return deviation > maxDeviationPercent;
}

/**
 * Filter prices that exceed maximum deviation
 * @param {PriceData[]} prices - Array of price data
 * @param {number} maxDeviationPercent - Maximum deviation percentage
 * @returns {PriceData[]} Filtered prices
 */
export function filterByDeviation(
  prices: PriceData[],
  maxDeviationPercent: number
): PriceData[] {
  if (prices.length === 0) return prices;

  // Calculate median price
  const values = prices.map((p) => p.price).sort((a, b) => a - b);
  const medianPrice =
    values.length % 2 === 0
      ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
      : values[Math.floor(values.length / 2)];

  // Filter prices within deviation
  return prices.filter((p) => {
    const deviation = Math.abs((p.price - medianPrice) / medianPrice) * 100;
    return deviation <= maxDeviationPercent;
  });
}

/**
 * Validate all prices and filter invalid ones
 * @param {PriceData[]} prices - Array of price data
 * @param {Partial<AggregationConfig>} config - Aggregation configuration
 * @returns {{ valid: PriceData[]; invalid: PriceData[] }} Valid and invalid prices
 */
export function validatePrices(
  prices: PriceData[],
  config: Partial<AggregationConfig> = {}
): { valid: PriceData[]; invalid: PriceData[] } {
  const valid: PriceData[] = [];
  const invalid: PriceData[] = [];

  for (const price of prices) {
    if (validatePrice(price, config)) {
      valid.push(price);
    } else {
      invalid.push(price);
    }
  }

  return { valid, invalid };
}
