/**
 * @fileoverview Main entry point for DeFi Protocols package
 * @description Exports all public APIs for DeFi protocol integrations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

// Types
export * from './types/defi-types.js';
export * from './types/protocol-interface.js';
export * from './types/operations.js';

// Base Protocol
export { BaseProtocol } from './protocols/base-protocol.js';

// Aggregator
export { DexAggregatorService } from './aggregator/DexAggregatorService.js';
export * from './aggregator/types.js';
export { DexAggregator } from './services/dex-aggregator.js';
export {
  SmartRouter,
  findOptimalRoute,
  DEFAULT_TRANSIT_ASSETS,
} from './services/smart-router.js';
export type {
  GasCostContext,
  Route,
  RouteHop,
  SmartRouterOptions,
  SmartRouterQuoteService,
} from './services/smart-router.js';
export type {
  IDexAggregator,
  DexAggregatorConfig,
  AggregatorExecutionParams,
  AggregatorExecutionResult,
  BestPriceResult,
} from './types/aggregator-types.js';

// Protocol Implementations
export * from './protocols/blend/index.js';
export * from './protocols/soroswap/index.js';
export * from './protocols/sdex/index.js';
export * from './protocols/aquarius/index.js';

// Services
export { ProtocolFactory, getProtocolFactory } from './services/protocol-factory.js';

// Constants
export * from './constants/networks.js';
export * from './constants/protocols.js';

// Utils
export * from './utils/validation.js';
export * from './utils/type-guards.js';
export * from './utils/yield-calculator.js';

// Strategies
export {
  AutoCompoundStrategy,
  type AutoCompoundConfig,
  type CompoundAuditEvent,
  type HarvestResult,
} from './strategies/auto-compound.js';
export {
  optimizeHarvestTiming,
  estimateCompoundedApy,
  type HarvestOptimizerInput,
  type HarvestOptimizerResult,
} from './strategies/harvest-optimizer.js';

// Errors
export * from './errors/index.js';

// ---- Merged from @galaxy-kj/core-defi ----

// Horizon DEX Aggregator (quote-first, XDR-returning aggregator across SDEX + Soroswap)
export { HorizonDexAggregatorService } from './services/HorizonDexAggregatorService.js';
export type {
  LiquiditySource,
  RouteQuote,
  AggregatedQuote,
  AggregateQuoteParams,
  AggregatedSwapResult,
  AggregateSwapParams,
  SourcePrice,
  PriceComparison,
} from './types/defi-aggregator.types.js';

// Oracle Pusher (off-chain price pusher for the on-chain Soroban Price Oracle)
export { OraclePusherService } from './services/OraclePusherService.js';
export type {
  AssetPair,
  FetchedPrice,
  OraclePusherConfig,
  PriceProvider,
  PushCycleSummary,
  PushResult,
} from './types/oracle-pusher.types.js';

// Liquidity Analytics (unified pool analytics for SDEX and Soroswap)
export { LiquidityAnalyticsService } from './services/LiquidityAnalyticsService.js';
export { SDEXAnalyticsEngine } from './services/SDEXAnalyticsEngine.js';
export type {
  UnifiedPoolAnalytics,
  LiquidityAnalyticsConfig,
  PriceResolver,
} from './types/liquidity-analytics.types.js';
