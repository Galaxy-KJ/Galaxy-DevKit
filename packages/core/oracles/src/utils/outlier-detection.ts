/**
 * @fileoverview Outlier detection utilities
 * @description Statistical methods for detecting price outliers
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData } from '../types/oracle-types';

/**
 * Outlier detection method
 * @enum {string}
 */
export enum OutlierMethod {
  IQR = 'iqr',
  Z_SCORE = 'z_score',
}

/**
 * Calculate median of an array
 * @param {number[]} values - Array of numbers
 * @returns {number} Median value
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

/**
 * Calculate quartiles
 * @param {number[]} values - Array of numbers
 * @returns {{ q1: number; q2: number; q3: number }} Quartiles
 */
function quartiles(values: number[]): { q1: number; q2: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  const q2 = median(sorted);

  if (sorted.length % 2 === 0) {
    const lowerHalf = sorted.slice(0, mid);
    const upperHalf = sorted.slice(mid);
    return {
      q1: median(lowerHalf),
      q2,
      q3: median(upperHalf),
    };
  }

  const lowerHalf = sorted.slice(0, mid);
  const upperHalf = sorted.slice(mid + 1);
  return {
    q1: median(lowerHalf),
    q2,
    q3: median(upperHalf),
  };
}

/**
 * Calculate mean
 * @param {number[]} values - Array of numbers
 * @returns {number} Mean value
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Calculate standard deviation
 * @param {number[]} values - Array of numbers
 * @returns {number} Standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

/**
 * Detect outliers using IQR (Interquartile Range) method
 * @param {PriceData[]} prices - Array of price data
 * @returns {PriceData[]} Array of outliers
 */
export function detectOutliersIQR(prices: PriceData[]): PriceData[] {
  if (prices.length < 4) {
    return []; // Need at least 4 prices for IQR
  }

  const values = prices.map((p) => p.price);
  const { q1, q3 } = quartiles(values);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return prices.filter(
    (p) => p.price < lowerBound || p.price > upperBound
  );
}

/**
 * Detect outliers using Z-score method
 * @param {PriceData[]} prices - Array of price data
 * @param {number} threshold - Z-score threshold (default: 2.0)
 * @returns {PriceData[]} Array of outliers
 */
export function detectOutliersZScore(
  prices: PriceData[],
  threshold: number = 2.0
): PriceData[] {
  if (prices.length < 3) {
    return []; // Need at least 3 prices for Z-score
  }

  const values = prices.map((p) => p.price);
  const avg = mean(values);
  const stdDev = standardDeviation(values);

  if (stdDev === 0) {
    return []; // No variation, no outliers
  }

  return prices.filter((p) => {
    const zScore = Math.abs((p.price - avg) / stdDev);
    return zScore > threshold;
  });
}

/**
 * Detect outliers using specified method
 * @param {PriceData[]} prices - Array of price data
 * @param {OutlierMethod} method - Detection method
 * @param {number} threshold - Threshold for Z-score method
 * @returns {PriceData[]} Array of outliers
 */
export function detectOutliers(
  prices: PriceData[],
  method: OutlierMethod = OutlierMethod.Z_SCORE,
  threshold: number = 2.0
): PriceData[] {
  if (prices.length === 0) {
    return [];
  }

  switch (method) {
    case OutlierMethod.IQR:
      return detectOutliersIQR(prices);
    case OutlierMethod.Z_SCORE:
      return detectOutliersZScore(prices, threshold);
    default:
      return detectOutliersZScore(prices, threshold);
  }
}

/**
 * Filter outliers from price array
 * @param {PriceData[]} prices - Array of price data
 * @param {OutlierMethod} method - Detection method
 * @param {number} threshold - Threshold for Z-score method
 * @returns {{ filtered: PriceData[]; outliers: PriceData[] }} Filtered prices and outliers
 */
export function filterOutliers(
  prices: PriceData[],
  method: OutlierMethod = OutlierMethod.Z_SCORE,
  threshold: number = 2.0
): { filtered: PriceData[]; outliers: PriceData[] } {
  const outliers = detectOutliers(prices, method, threshold);
  const outlierSources = new Set(outliers.map((o) => o.source));
  const filtered = prices.filter((p) => !outlierSources.has(p.source));

  return { filtered, outliers };
}
