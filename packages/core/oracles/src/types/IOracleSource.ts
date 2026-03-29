/**
 * @fileoverview IOracleSource interface
 * @description Interface for oracle price data sources
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { PriceData, SourceInfo } from './oracle-types.js';

/**
 * Oracle source interface
 * All oracle sources must implement this interface
 * @interface IOracleSource
 */
export interface IOracleSource {
  /**
   * Source name (must be unique)
   */
  readonly name: string;

  /**
   * Fetch price for a single symbol
   * @param {string} symbol - Asset symbol (e.g., 'XLM', 'USDC')
   * @returns {Promise<PriceData>} Price data
   * @throws {Error} If symbol is not supported or fetch fails
   */
  getPrice(symbol: string): Promise<PriceData>;

  /**
   * Fetch prices for multiple symbols
   * @param {string[]} symbols - Array of asset symbols
   * @returns {Promise<PriceData[]>} Array of price data
   * @throws {Error} If any symbol is not supported or fetch fails
   */
  getPrices(symbols: string[]): Promise<PriceData[]>;

  /**
   * Get source metadata and information
   * @returns {SourceInfo} Source information
   */
  getSourceInfo(): SourceInfo;

  /**
   * Check if the source is healthy and available
   * @returns {Promise<boolean>} True if healthy, false otherwise
   */
  isHealthy(): Promise<boolean>;
}
