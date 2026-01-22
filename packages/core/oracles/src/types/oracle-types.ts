/**
 * @fileoverview Type definitions for Oracle system
 * @description Contains all interfaces and types for oracle price aggregation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

/**
 * Price data from a single oracle source
 * @interface PriceData
 * @property {string} symbol - Asset symbol (e.g., 'XLM', 'USDC')
 * @property {number} price - Price value
 * @property {Date} timestamp - When the price was fetched
 * @property {string} source - Name of the oracle source
 * @property {Record<string, unknown>} metadata - Additional metadata
 */
export interface PriceData {
  symbol: string;
  price: number;
  timestamp: Date;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated price result from multiple sources
 * @interface AggregatedPrice
 * @property {string} symbol - Asset symbol
 * @property {number} price - Aggregated price value
 * @property {Date} timestamp - Aggregation timestamp
 * @property {number} confidence - Confidence score (0-1)
 * @property {string[]} sourcesUsed - Names of sources used in aggregation
 * @property {string[]} outliersFiltered - Names of sources filtered as outliers
 * @property {number} sourceCount - Number of sources that provided valid prices
 * @property {Record<string, unknown>} metadata - Additional metadata
 */
export interface AggregatedPrice {
  symbol: string;
  price: number;
  timestamp: Date;
  confidence: number;
  sourcesUsed: string[];
  outliersFiltered: string[];
  sourceCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Oracle source metadata
 * @interface PriceSource
 * @property {string} name - Source name
 * @property {number} weight - Weight for weighted averaging (default: 1.0)
 * @property {boolean} isHealthy - Current health status
 * @property {Date} lastChecked - Last health check timestamp
 * @property {number} failureCount - Number of consecutive failures
 */
export interface PriceSource {
  name: string;
  weight: number;
  isHealthy: boolean;
  lastChecked: Date;
  failureCount: number;
}

/**
 * Detailed source information
 * @interface SourceInfo
 * @property {string} name - Source name
 * @property {string} description - Source description
 * @property {string} version - Source version
 * @property {string[]} supportedSymbols - List of supported symbols (empty = all)
 * @property {Record<string, unknown>} metadata - Additional metadata
 */
export interface SourceInfo {
  name: string;
  description: string;
  version: string;
  supportedSymbols: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Aggregation configuration
 * @interface AggregationConfig
 * @property {number} minSources - Minimum number of sources required (default: 2)
 * @property {number} maxDeviationPercent - Maximum deviation percentage (default: 10)
 * @property {number} maxStalenessMs - Maximum age of price data in milliseconds (default: 60000)
 * @property {boolean} enableOutlierDetection - Enable outlier filtering (default: true)
 * @property {number} outlierThreshold - Outlier detection threshold (default: 2.0 for Z-score)
 */
export interface AggregationConfig {
  minSources: number;
  maxDeviationPercent: number;
  maxStalenessMs: number;
  enableOutlierDetection: boolean;
  outlierThreshold: number;
}

/**
 * Cache configuration
 * @interface CacheConfig
 * @property {number} ttlMs - Time to live in milliseconds (default: 60000)
 * @property {number} maxSize - Maximum cache size (default: 1000)
 * @property {boolean} enableFallback - Enable fallback to cached data on failures (default: true)
 */
export interface CacheConfig {
  ttlMs: number;
  maxSize: number;
  enableFallback: boolean;
}

/**
 * Circuit breaker state
 * @enum {string}
 */
export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

/**
 * Circuit breaker configuration
 * @interface CircuitBreakerConfig
 * @property {number} failureThreshold - Number of failures before opening (default: 5)
 * @property {number} resetTimeoutMs - Time before attempting to close (default: 60000)
 * @property {number} halfOpenMaxCalls - Max calls in half-open state (default: 3)
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxCalls: number;
}
