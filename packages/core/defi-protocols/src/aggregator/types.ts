import { Asset } from '../types/defi-types.js';

/**
 * Supported venues the aggregator can pull liquidity from (#273).
 *
 * `aquarius` was added alongside the existing Soroswap + SDEX adapters
 * so users can opt into one of Stellar's principal AMM pools whenever
 * it offers a better price than the alternatives.
 */
export type AggregatorVenue = 'soroswap' | 'sdex' | 'aquarius';

export interface AggregatorRoute {
  venue: AggregatorVenue;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  path: string[];
}

export interface AggregatorQuote {
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  routes: AggregatorRoute[];
  totalAmountOut: string;
  effectivePrice: number;
  savingsVsBestSingle: number;
}

/**
 * Public surface implemented by `DexAggregatorService` (#273).
 * Pinning the shape on an interface lets callers depend on the
 * contract rather than the concrete class and makes the service
 * trivially mockable in downstream tests (e.g. split-executor #275).
 */
export interface IDEXAggregator {
  getBestQuote(assetIn: Asset, assetOut: Asset, amountIn: string): Promise<AggregatorQuote>;
  getSplitQuote(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    splits: number[],
  ): Promise<AggregatorQuote>;
}
