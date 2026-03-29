/**
 * @fileoverview Type definitions for the DEX Aggregator Service
 * @description Data structures for routing, quotes, and aggregated swap results
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Asset } from '@galaxy-kj/core-defi-protocols';

/**
 * Supported liquidity sources the aggregator queries
 */
export type LiquiditySource = 'sdex' | 'soroswap' | 'aquarius';

/**
 * A single route option returned from one liquidity source
 */
export interface RouteQuote {
  /** Source that produced this quote */
  source: LiquiditySource;
  /** Input token */
  assetIn: Asset;
  /** Output token */
  assetOut: Asset;
  /** Exact amount sent */
  amountIn: string;
  /** Estimated amount received */
  amountOut: string;
  /** Effective price: amountOut / amountIn */
  price: string;
  /** Estimated price impact as a percentage string, e.g. "0.12" */
  priceImpact: string;
  /** Fee charged by the source (as a decimal fraction, e.g. "0.003" = 0.3%) */
  fee: string;
  /** Intermediate hops (token addresses), empty for direct swaps */
  path: string[];
  /** Liquidity depth indicator */
  liquidityDepth: 'high' | 'medium' | 'low';
  /** When this quote was fetched */
  fetchedAt: Date;
}

/**
 * Result of an aggregated quote comparison across all sources
 */
export interface AggregatedQuote {
  /** Input token */
  assetIn: Asset;
  /** Output token */
  assetOut: Asset;
  /** Amount sent */
  amountIn: string;
  /** All route quotes, sorted best-first (highest amountOut) */
  routes: RouteQuote[];
  /** The best route (first in routes array) */
  bestRoute: RouteQuote;
  /** Whether the best route has high price impact (>= 5%) */
  highImpactWarning: boolean;
  /** Timestamp of the aggregation */
  timestamp: Date;
}

/**
 * Parameters for requesting an aggregated quote
 */
export interface AggregateQuoteParams {
  /** Input token */
  assetIn: Asset;
  /** Output token */
  assetOut: Asset;
  /** Amount to sell (decimal string, e.g. "100") */
  amountIn: string;
  /** Sources to query; defaults to all available */
  sources?: LiquiditySource[];
}

/**
 * Result of executing an aggregated swap
 */
export interface AggregatedSwapResult {
  /** Source used for the swap */
  source: LiquiditySource;
  /** Unsigned XDR transaction ready for client-side signing */
  xdr: string;
  /** Route quote used for this swap */
  quote: RouteQuote;
  /** Whether high price impact was present */
  highImpactWarning: boolean;
}

/**
 * Parameters for executing an aggregated swap
 */
export interface AggregateSwapParams {
  /** Wallet public key */
  signerPublicKey: string;
  /** Input token */
  assetIn: Asset;
  /** Output token */
  assetOut: Asset;
  /** Amount to sell */
  amountIn: string;
  /** Minimum amount to receive (slippage protection) */
  minAmountOut: string;
  /** Preferred source; if omitted the best-rate source is used */
  preferredSource?: LiquiditySource;
}

/**
 * Price comparison entry for a single source
 */
export interface SourcePrice {
  source: LiquiditySource;
  price: string;
  available: boolean;
  error?: string;
}

/**
 * Full price comparison across all sources for a given pair
 */
export interface PriceComparison {
  assetIn: Asset;
  assetOut: Asset;
  amountIn: string;
  prices: SourcePrice[];
  bestSource: LiquiditySource;
  timestamp: Date;
}
