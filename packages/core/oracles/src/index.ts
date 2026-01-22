/**
 * @fileoverview Main entry point for Oracles package
 * @description Exports all public APIs for oracle price aggregation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

// Types
export type * from './types/oracle-types';
export type * from './types/IOracleSource';

// Aggregator
export { OracleAggregator } from './aggregator/OracleAggregator';

// Strategies
export type { AggregationStrategy } from './aggregator/strategies/AggregationStrategy';
export { MedianStrategy } from './aggregator/strategies/MedianStrategy';
export { WeightedAverageStrategy } from './aggregator/strategies/WeightedAverageStrategy';
export { TWAPStrategy } from './aggregator/strategies/TWAPStrategy';

// Cache
export { PriceCache } from './cache/price-cache';

// Validation
export * from './validation/price-validator';

// Utils
export * from './utils/outlier-detection';
export * from './utils/retry-utils';
