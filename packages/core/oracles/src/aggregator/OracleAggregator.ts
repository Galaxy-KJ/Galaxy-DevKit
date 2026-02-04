/**
 * @fileoverview Oracle aggregator
 * @description Main class for aggregating prices from multiple oracle sources
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { IOracleSource } from '../types/IOracleSource.js';
import {
  PriceData,
  AggregatedPrice,
  PriceSource,
  AggregationConfig,
  CacheConfig,
  CircuitBreakerState,
  CircuitBreakerConfig,
} from '../types/oracle-types.js';
import { AggregationStrategy } from './strategies/AggregationStrategy.js';
import { MedianStrategy } from './strategies/MedianStrategy.js';
import { PriceCache } from '../cache/price-cache.js';
import {
  validatePrices,
  requireMinimumSources,
  filterByDeviation,
} from '../validation/price-validator.js';
import { filterOutliers, OutlierMethod } from '../utils/outlier-detection.js';
import { retryWithBackoff } from '../utils/retry-utils.js';

/**
 * Default aggregation configuration
 */
const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  minSources: 2,
  maxDeviationPercent: 10,
  maxStalenessMs: 60000,
  enableOutlierDetection: true,
  outlierThreshold: 2.0,
};

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenMaxCalls: 3,
};

/**
 * Circuit breaker state for a source
 * @interface CircuitBreakerStateInfo
 */
interface CircuitBreakerStateInfo {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime: Date | null;
  halfOpenCalls: number;
}

/**
 * Oracle aggregator class
 * @class OracleAggregator
 */
export class OracleAggregator {
  private sources: Map<string, IOracleSource>;
  private sourceWeights: Map<string, number>;
  private sourceHealth: Map<string, PriceSource>;
  private circuitBreakers: Map<string, CircuitBreakerStateInfo>;
  private strategy: AggregationStrategy;
  private cache: PriceCache;
  private config: AggregationConfig;
  private circuitBreakerConfig: CircuitBreakerConfig;

  /**
   * Create a new oracle aggregator
   * @param {Partial<AggregationConfig>} config - Aggregation configuration
   * @param {Partial<CacheConfig>} cacheConfig - Cache configuration
   * @param {Partial<CircuitBreakerConfig>} circuitBreakerConfig - Circuit breaker configuration
   */
  constructor(
    config: Partial<AggregationConfig> = {},
    cacheConfig: Partial<CacheConfig> = {},
    circuitBreakerConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.sources = new Map();
    this.sourceWeights = new Map();
    this.sourceHealth = new Map();
    this.circuitBreakers = new Map();
    this.config = { ...DEFAULT_AGGREGATION_CONFIG, ...config };
    this.circuitBreakerConfig = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...circuitBreakerConfig,
    };
    this.cache = new PriceCache(cacheConfig);
    this.strategy = new MedianStrategy(); // Default strategy
  }

  /**
   * Add an oracle source
   * @param {IOracleSource} source - Oracle source to add
   * @param {number} weight - Optional weight for weighted averaging (default: 1.0)
   */
  addSource(source: IOracleSource, weight: number = 1.0): void {
    if (this.sources.has(source.name)) {
      throw new Error(`Source ${source.name} is already registered`);
    }

    this.sources.set(source.name, source);
    this.sourceWeights.set(source.name, weight);
    this.sourceHealth.set(source.name, {
      name: source.name,
      weight,
      isHealthy: true,
      lastChecked: new Date(),
      failureCount: 0,
    });
    this.circuitBreakers.set(source.name, {
      state: CircuitBreakerState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      halfOpenCalls: 0,
    });
  }

  /**
   * Remove an oracle source
   * @param {string} name - Source name to remove
   */
  removeSource(name: string): void {
    this.sources.delete(name);
    this.sourceWeights.delete(name);
    this.sourceHealth.delete(name);
    this.circuitBreakers.delete(name);
  }

  /**
   * Set aggregation strategy
   * @param {AggregationStrategy} strategy - Aggregation strategy
   */
  setStrategy(strategy: AggregationStrategy): void {
    this.strategy = strategy;
  }

  /**
   * Get current aggregation strategy
   * @returns {AggregationStrategy} Current strategy
   */
  getStrategy(): AggregationStrategy {
    return this.strategy;
  }

  /**
   * Check circuit breaker state
   * @param {string} sourceName - Source name
   * @returns {boolean} True if source can be called
   */
  private canCallSource(sourceName: string): boolean {
    const breaker = this.circuitBreakers.get(sourceName);
    if (!breaker) {
      return false;
    }

    const now = new Date();

    switch (breaker.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if reset timeout has passed
        if (
          breaker.lastFailureTime &&
          now.getTime() - breaker.lastFailureTime.getTime() >=
            this.circuitBreakerConfig.resetTimeoutMs
        ) {
          // Transition to half-open
          breaker.state = CircuitBreakerState.HALF_OPEN;
          breaker.halfOpenCalls = 0;
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Allow limited calls in half-open state
        if (breaker.halfOpenCalls < this.circuitBreakerConfig.halfOpenMaxCalls) {
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Record success for circuit breaker
   * @param {string} sourceName - Source name
   */
  private recordSuccess(sourceName: string): void {
    const breaker = this.circuitBreakers.get(sourceName);
    if (!breaker) {
      return;
    }

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      // Success in half-open: close the circuit
      breaker.state = CircuitBreakerState.CLOSED;
      breaker.failureCount = 0;
      breaker.halfOpenCalls = 0;
    } else {
      // Reset failure count on success
      breaker.failureCount = 0;
    }

    const health = this.sourceHealth.get(sourceName);
    if (health) {
      health.isHealthy = true;
      health.failureCount = 0;
      health.lastChecked = new Date();
    }
  }

  /**
   * Record failure for circuit breaker
   * @param {string} sourceName - Source name
   */
  private recordFailure(sourceName: string): void {
    const breaker = this.circuitBreakers.get(sourceName);
    if (!breaker) {
      return;
    }

    breaker.failureCount++;
    breaker.lastFailureTime = new Date();

    if (breaker.state === CircuitBreakerState.HALF_OPEN) {
      // Failure in half-open: open the circuit
      breaker.state = CircuitBreakerState.OPEN;
      breaker.halfOpenCalls = 0;
    } else if (
      breaker.failureCount >= this.circuitBreakerConfig.failureThreshold
    ) {
      // Too many failures: open the circuit
      breaker.state = CircuitBreakerState.OPEN;
    }

    const health = this.sourceHealth.get(sourceName);
    if (health) {
      health.isHealthy = false;
      health.failureCount = breaker.failureCount;
      health.lastChecked = new Date();
    }
  }

  /**
   * Fetch price from a single source with retry and circuit breaker
   * @param {IOracleSource} source - Oracle source
   * @param {string} symbol - Asset symbol
   * @returns {Promise<PriceData | null>} Price data or null if failed
   */
  private async fetchPriceFromSource(
    source: IOracleSource,
    symbol: string
  ): Promise<PriceData | null> {
    const sourceName = source.name;

    // Check circuit breaker
    if (!this.canCallSource(sourceName)) {
      // Try to get from cache as fallback
      const cached = this.cache.getPrice(symbol, sourceName);
      if (cached) {
        return cached;
      }
      return null;
    }

    // Check cache first
    const cached = this.cache.getPrice(symbol, sourceName);
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      if (age < this.config.maxStalenessMs) {
        return cached;
      }
    }

    try {
      // Fetch with retry
      const price = await retryWithBackoff(
        () => source.getPrice(symbol),
        {
          maxAttempts: 3,
          initialDelayMs: 1000,
        }
      );

      // Cache the price
      this.cache.setPrice(price);

      // Record success
      this.recordSuccess(sourceName);
      if (this.circuitBreakers.get(sourceName)?.state === CircuitBreakerState.HALF_OPEN) {
        const breaker = this.circuitBreakers.get(sourceName);
        if (breaker) {
          breaker.halfOpenCalls++;
        }
      }

      return price;
    } catch (error) {
      // Record failure
      this.recordFailure(sourceName);

      // Try to get from cache as fallback
      const cached = this.cache.getPrice(symbol, sourceName);
      if (cached) {
        return cached;
      }

      return null;
    }
  }

  /**
   * Fetch prices from all sources in parallel
   * @param {string} symbol - Asset symbol
   * @returns {Promise<PriceData[]>} Array of price data
   */
  private async fetchPricesFromAllSources(
    symbol: string
  ): Promise<PriceData[]> {
    const fetchPromises = Array.from(this.sources.values()).map((source) =>
      this.fetchPriceFromSource(source, symbol)
    );

    const results = await Promise.allSettled(fetchPromises);
    const prices: PriceData[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        prices.push(result.value);
      }
    }

    return prices;
  }

  /**
   * Get aggregated price for a symbol
   * @param {string} symbol - Asset symbol
   * @returns {Promise<AggregatedPrice>} Aggregated price
   * @throws {Error} If insufficient sources or aggregation fails
   */
  async getAggregatedPrice(symbol: string): Promise<AggregatedPrice> {
    // Check cache first
    const cached = this.cache.getAggregatedPrice(symbol);
    if (cached) {
      const age = Date.now() - cached.timestamp.getTime();
      if (age < this.config.maxStalenessMs) {
        return cached;
      }
    }

    // Fetch prices from all sources
    let prices = await this.fetchPricesFromAllSources(symbol);

    // Validate prices
    const { valid, invalid } = validatePrices(prices, this.config);
    prices = valid;

    // Check minimum sources requirement
    if (!requireMinimumSources(prices, this.config.minSources)) {
      // Try to get from cache as fallback
      const cached = this.cache.getAggregatedPrice(symbol);
      if (cached) {
        return cached;
      }
      throw new Error(
        `Insufficient sources: got ${prices.length}, required ${this.config.minSources}`
      );
    }

    // Filter by deviation if needed
    if (this.config.maxDeviationPercent > 0) {
      prices = filterByDeviation(prices, this.config.maxDeviationPercent);
    }

    // Detect and filter outliers
    let outliers: PriceData[] = [];
    if (this.config.enableOutlierDetection) {
      const result = filterOutliers(
        prices,
        OutlierMethod.Z_SCORE,
        this.config.outlierThreshold
      );
      prices = result.filtered;
      outliers = result.outliers;
    }

    // Check minimum sources again after filtering
    if (!requireMinimumSources(prices, this.config.minSources)) {
      // Try to get from cache as fallback
      const cached = this.cache.getAggregatedPrice(symbol);
      if (cached) {
        return cached;
      }
      throw new Error(
        `Insufficient sources after filtering: got ${prices.length}, required ${this.config.minSources}`
      );
    }

    // Aggregate prices
    const aggregatedPrice = this.strategy.aggregate(
      prices,
      this.sourceWeights
    );

    // Calculate confidence (based on number of sources and outliers)
    const totalSources = prices.length + outliers.length;
    const confidence =
      totalSources > 0
        ? Math.min(1.0, prices.length / Math.max(1, totalSources))
        : 0;

    const aggregated: AggregatedPrice = {
      symbol,
      price: aggregatedPrice,
      timestamp: new Date(),
      confidence,
      sourcesUsed: prices.map((p) => p.source),
      outliersFiltered: outliers.map((o) => o.source),
      sourceCount: prices.length,
    };

    // Cache the aggregated price
    this.cache.setAggregatedPrice(aggregated);

    return aggregated;
  }

  /**
   * Get aggregated prices for multiple symbols
   * @param {string[]} symbols - Array of asset symbols
   * @returns {Promise<AggregatedPrice[]>} Array of aggregated prices
   */
  async getAggregatedPrices(symbols: string[]): Promise<AggregatedPrice[]> {
    const promises = symbols.map((symbol) => this.getAggregatedPrice(symbol));
    return Promise.all(promises);
  }

  /**
   * Get health status of all sources
   * @returns {Promise<Map<string, boolean>>} Map of source name to health status
   */
  async getSourceHealth(): Promise<Map<string, boolean>> {
    const healthMap = new Map<string, boolean>();

    // Check health of all sources in parallel
    const healthChecks = Array.from(this.sources.entries()).map(
      async ([name, source]) => {
        try {
          const isHealthy = await source.isHealthy();
          healthMap.set(name, isHealthy);

          const health = this.sourceHealth.get(name);
          if (health) {
            health.isHealthy = isHealthy;
            health.lastChecked = new Date();
          }
        } catch (error) {
          healthMap.set(name, false);
          const health = this.sourceHealth.get(name);
          if (health) {
            health.isHealthy = false;
            health.lastChecked = new Date();
          }
        }
      }
    );

    await Promise.allSettled(healthChecks);

    return healthMap;
  }

  /**
   * Get all registered sources
   * @returns {PriceSource[]} Array of source information
   */
  getSources(): PriceSource[] {
    return Array.from(this.sourceHealth.values());
  }

  /**
   * Update aggregation configuration
   * @param {Partial<AggregationConfig>} config - Partial configuration to update
   */
  updateConfig(config: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   * @returns {AggregationConfig} Current configuration
   */
  getConfig(): AggregationConfig {
    return { ...this.config };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
  }
}
