/**
 * @fileoverview Mock Oracle Sources
 * @description Mock implementations of IOracleSource for testing
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { IOracleSource } from '../../types/IOracleSource';
import { PriceData, SourceInfo } from '../../types/oracle-types';

/**
 * Mock oracle source for testing
 * @class MockOracleSource
 * @implements {IOracleSource}
 */
export class MockOracleSource implements IOracleSource {
  public readonly name: string;
  private prices: Map<string, number>;
  private healthy: boolean;
  private delayMs: number;
  private shouldFail: boolean;

  /**
   * Create a new mock oracle source
   * @param {string} name - Source name
   * @param {Map<string, number>} prices - Price map
   * @param {boolean} healthy - Health status
   * @param {number} delayMs - Response delay
   * @param {boolean} shouldFail - Whether to fail requests
   */
  constructor(
    name: string,
    prices: Map<string, number> = new Map(),
    healthy: boolean = true,
    delayMs: number = 0,
    shouldFail: boolean = false
  ) {
    this.name = name;
    this.prices = prices;
    this.healthy = healthy;
    this.delayMs = delayMs;
    this.shouldFail = shouldFail;
  }

  /**
   * Get price for a symbol
   * @param {string} symbol - Asset symbol
   * @returns {Promise<PriceData>} Price data
   */
  async getPrice(symbol: string): Promise<PriceData> {
    if (this.shouldFail) {
      throw new Error(`Mock source ${this.name} failed`);
    }

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    const price = this.prices.get(symbol) || 100;
    return {
      symbol,
      price,
      timestamp: new Date(),
      source: this.name,
    };
  }

  /**
   * Get prices for multiple symbols
   * @param {string[]} symbols - Asset symbols
   * @returns {Promise<PriceData[]>} Array of price data
   */
  async getPrices(symbols: string[]): Promise<PriceData[]> {
    return Promise.all(symbols.map(s => this.getPrice(s)));
  }

  /**
   * Get source information
   * @returns {SourceInfo} Source info
   */
  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: `Mock oracle source ${this.name}`,
      version: '1.0.0',
      supportedSymbols: Array.from(this.prices.keys()),
    };
  }

  /**
   * Check if source is healthy
   * @returns {Promise<boolean>} Health status
   */
  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  /**
   * Set price for a symbol
   * @param {string} symbol - Asset symbol
   * @param {number} price - Price value
   */
  setPrice(symbol: string, price: number): void {
    this.prices.set(symbol, price);
  }

  /**
   * Set health status
   * @param {boolean} healthy - Health status
   */
  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  /**
   * Set failure mode
   * @param {boolean} shouldFail - Whether to fail
   */
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }
}

/**
 * Failing mock source
 * @class FailingMockSource
 * @extends {MockOracleSource}
 */
export class FailingMockSource extends MockOracleSource {
  constructor(name: string) {
    super(name, new Map(), true, 0, true);
  }
}

/**
 * Slow mock source
 * @class SlowMockSource
 * @extends {MockOracleSource}
 */
export class SlowMockSource extends MockOracleSource {
  constructor(name: string, delayMs: number = 1000) {
    super(name, new Map(), true, delayMs, false);
  }
}

/**
 * Unhealthy mock source
 * @class UnhealthyMockSource
 * @extends {MockOracleSource}
 */
export class UnhealthyMockSource extends MockOracleSource {
  constructor(name: string) {
    super(name, new Map(), false, 0, false);
  }
}
