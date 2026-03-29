/**
 * @fileoverview Main entry point for Oracles package
 * @description Exports all public APIs for oracle price aggregation
 * @author Galaxy DevKit Team
 * @version 2.1.0
 * @since 2024-01-15
 */

// Types
export * from './types/oracle-types.js';
export * from './types/IOracleSource.js';

// Aggregator
export { OracleAggregator } from './aggregator/OracleAggregator.js';

// Strategies
export type { AggregationStrategy } from './aggregator/strategies/AggregationStrategy.js';
export { MedianStrategy } from './aggregator/strategies/MedianStrategy.js';
export { MeanStrategy } from './aggregator/strategies/MeanStrategy.js';
export { WeightedAverageStrategy } from './aggregator/strategies/WeightedAverageStrategy.js';
export { TWAPStrategy } from './aggregator/strategies/TWAPStrategy.js';

// Cache
export { PriceCache } from './cache/price-cache.js';

// Validation
export * from './validation/price-validator.js';

// Utils
export * from './utils/outlier-detection.js';
export * from './utils/retry-utils.js';

export * from './sources/mocks/MockOracleSources.js';
export * from './sources/real/index.js';
