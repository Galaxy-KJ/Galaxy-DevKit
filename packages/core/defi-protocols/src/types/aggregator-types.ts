/**
 * @fileoverview Public types for the cross-DEX aggregator
 * @description Defines the IDexAggregator interface plus the request/response
 *   shapes for `getBestPrice()` and `executeBestRoute()`. Kept separate from
 *   the implementation file so consumers can depend on the interface without
 *   pulling in the underlying quoting service and its transitive deps.
 * @author Galaxy DevKit Team
 * @since 2026-04-28
 */

import type { Asset, ProtocolConfig, TransactionResult } from './defi-types.js';
import type {
  AggregatorQuote,
  AggregatorRoute,
  AggregatorVenue,
} from '../aggregator/types.js';

// Re-export the existing aggregator primitives so callers can import everything
// from one entry point: `import { ... } from '@galaxy-kj/core-defi-protocols';`
export type { AggregatorQuote, AggregatorRoute, AggregatorVenue };

/**
 * Result returned from `IDexAggregator.getBestPrice()`. This is a thin
 * convenience layer over `AggregatorQuote` that surfaces the single most
 * useful field — the route the caller would execute — as a top-level
 * `bestRoute` shortcut, while still exposing the full quote for inspection.
 */
export interface BestPriceResult {
  /** The full aggregator quote (single or split). */
  quote: AggregatorQuote;
  /** The single route with the highest amountOut, picked from `quote.routes`. */
  bestRoute: AggregatorRoute;
  /** Total amount the caller will receive across all routes in the quote. */
  totalAmountOut: string;
  /** Effective `amountOut / amountIn` derived from `quote`. */
  effectivePrice: number;
  /** True when the quote bundles multiple venues (i.e. is a split route). */
  isSplit: boolean;
}

/**
 * Slippage controls for `executeBestRoute()`. The aggregator multiplies the
 * quoted `amountOut` by `(1 - slippageBps/10000)` to derive `minAmountOut`.
 */
export interface AggregatorExecutionParams {
  /** Address that will sign and submit the swap. */
  walletAddress: string;
  /**
   * Private key used to sign the swap. Required to satisfy the underlying
   * `IDefiProtocol.swap()` contract — callers using non-custodial signing
   * should pass an empty string and use a custom transaction builder upstream.
   */
  privateKey: string;
  /** Slippage tolerance in basis points (50 = 0.5 %). Defaults to 50. */
  slippageBps?: number;
  /**
   * Optional pre-computed best-price result. Skips a re-quote when the caller
   * already invoked `getBestPrice()` and is comfortable with the quoted price.
   */
  precomputed?: BestPriceResult;
}

/**
 * Outcome of `executeBestRoute()`. Each `AggregatorRoute` from the chosen
 * quote produces one `TransactionResult` — split quotes therefore return
 * multiple results.
 */
export interface AggregatorExecutionResult {
  quote: AggregatorQuote;
  results: Array<{
    route: AggregatorRoute;
    transaction: TransactionResult;
  }>;
}

/**
 * Public DEX aggregator contract.
 *
 * Implementations are expected to fan out to every supported venue (Soroswap,
 * SDEX, Aquarius, …), compute the best execution price (single venue or split
 * route), and execute the best route on behalf of the caller.
 */
export interface IDexAggregator {
  /**
   * Quote a swap across every supported venue and return the best execution
   * price.
   *
   * @param assetIn   Asset being sold.
   * @param assetOut  Asset being bought.
   * @param amountIn  Amount of `assetIn` to sell, as a decimal string.
   */
  getBestPrice(assetIn: Asset, assetOut: Asset, amountIn: string): Promise<BestPriceResult>;

  /**
   * Execute the best route returned by `getBestPrice()`. If `params.precomputed`
   * is omitted, the implementation will re-quote internally.
   */
  executeBestRoute(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    params: AggregatorExecutionParams,
  ): Promise<AggregatorExecutionResult>;
}

/**
 * Configuration accepted by the default aggregator implementation. The shape
 * mirrors `ProtocolConfig` so callers can reuse the same network config they
 * pass to individual protocol factories.
 */
export type DexAggregatorConfig = ProtocolConfig;
