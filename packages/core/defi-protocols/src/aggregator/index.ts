/**
 * Public surface for the DEX aggregator (#273 + #275).
 *
 * Bundles the service, types, supporting adapter, the split-execution
 * runner, and the liquidity-depth analyzer so downstream consumers
 * can pull everything from a single import path.
 */

export { DexAggregatorService } from './DexAggregatorService.js';
export { AquariusAdapter } from './AquariusAdapter.js';
export {
  SmartRouter,
  findOptimalRoute,
  DEFAULT_TRANSIT_ASSETS,
} from '../services/smart-router.js';
export type {
  GasCostContext,
  Route,
  RouteHop,
  SmartRouterOptions,
  SmartRouterQuoteService,
} from '../services/smart-router.js';
export type {
  AquariusAdapterOptions,
  AquariusQuoteRequest,
} from './AquariusAdapter.js';
export type {
  AggregatorQuote,
  AggregatorRoute,
  AggregatorVenue,
  IDEXAggregator,
} from './types.js';
export {
  executeSplitTrade,
  type ExecuteSplitTradeOptions,
  type SplitExecution,
  type SplitExecutionEntry,
  type SplitRouteSubmitter,
} from './split-executor.js';
export {
  LiquidityDepthAnalyzer,
  type LiquidityDepthSnapshot,
  type LiquidityDepthEntry,
} from './liquidity-depth.js';
export {
  calculateImpermanentLoss,
  projectImpermanentLoss,
} from '../utils/il-calculator.js';
export {
  buildLPPosition,
  type LPPosition,
} from '../utils/lp-position.js';
