/**
 * @fileoverview Default `IDexAggregator` implementation
 * @description Thin orchestrator that delegates quoting to the existing
 *   `DexAggregatorService` (Soroswap + SDEX + split routes) and execution to
 *   each venue's `IDefiProtocol.swap()`. Exposes the simple two-method
 *   interface — `getBestPrice` / `executeBestRoute` — required by roadmap
 *   item #31.
 * @author Galaxy DevKit Team
 * @since 2026-04-28
 */

import BigNumber from 'bignumber.js';

import type { Asset, ProtocolConfig, TransactionResult } from '../types/defi-types.js';
import type {
  AggregatorExecutionParams,
  AggregatorExecutionResult,
  BestPriceResult,
  DexAggregatorConfig,
  IDexAggregator,
} from '../types/aggregator-types.js';
import type { AggregatorQuote, AggregatorRoute, AggregatorVenue } from '../aggregator/types.js';
import { DexAggregatorService } from '../aggregator/DexAggregatorService.js';
import { ProtocolFactory } from './protocol-factory.js';

const DEFAULT_SLIPPAGE_BPS = 50; // 0.5 %
const BPS_DENOMINATOR = 10_000;

interface SwapCapableProtocol {
  initialize(): Promise<void>;
  swap?(
    walletAddress: string,
    privateKey: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    minAmountOut: string,
  ): Promise<TransactionResult>;
}

interface AggregatorProtocolFactoryLike {
  createProtocol(config: ProtocolConfig): SwapCapableProtocol;
}

interface QuoteServiceLike {
  getBestQuote(assetIn: Asset, assetOut: Asset, amountIn: string): Promise<AggregatorQuote>;
}

export interface DexAggregatorDeps {
  /** Override the underlying quote engine (test-only). */
  quoteService?: QuoteServiceLike;
  /** Override the protocol factory used during execution (test-only). */
  protocolFactory?: AggregatorProtocolFactoryLike;
}

/**
 * Default `IDexAggregator` implementation.
 *
 * `getBestPrice()` re-uses {@link DexAggregatorService} which already handles
 * single-venue + split-route quoting; `executeBestRoute()` walks the resulting
 * routes and dispatches to each venue's `swap()`.
 */
export class DexAggregator implements IDexAggregator {
  private readonly quoteService: QuoteServiceLike;
  private readonly protocolFactory: AggregatorProtocolFactoryLike;
  private readonly baseConfig: ProtocolConfig;

  constructor(config: DexAggregatorConfig, deps: DexAggregatorDeps = {}) {
    this.baseConfig = config;
    this.quoteService = deps.quoteService ?? new DexAggregatorService(config);
    this.protocolFactory =
      deps.protocolFactory ?? (ProtocolFactory.getInstance() as AggregatorProtocolFactoryLike);
  }

  async getBestPrice(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
  ): Promise<BestPriceResult> {
    const quote = await this.quoteService.getBestQuote(assetIn, assetOut, amountIn);
    return DexAggregator.fromQuote(quote);
  }

  async executeBestRoute(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    params: AggregatorExecutionParams,
  ): Promise<AggregatorExecutionResult> {
    if (!params.walletAddress) {
      throw new Error('walletAddress is required to execute a swap');
    }

    const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (!Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps >= BPS_DENOMINATOR) {
      throw new Error(`slippageBps must be in [0, ${BPS_DENOMINATOR})`);
    }

    const best = params.precomputed ?? (await this.getBestPrice(assetIn, assetOut, amountIn));

    const results: AggregatorExecutionResult['results'] = [];

    for (const route of best.quote.routes) {
      const minAmountOut = DexAggregator.applySlippage(route.amountOut, slippageBps);
      const protocol = this.protocolFactory.createProtocol(this.configForVenue(route.venue));
      await protocol.initialize();

      if (typeof protocol.swap !== 'function') {
        throw new Error(`Venue ${route.venue} does not expose a swap() method`);
      }

      const transaction = await protocol.swap(
        params.walletAddress,
        params.privateKey,
        assetIn,
        assetOut,
        route.amountIn,
        minAmountOut,
      );
      results.push({ route, transaction });
    }

    return { quote: best.quote, results };
  }

  /** Build the per-venue ProtocolConfig the factory expects. */
  private configForVenue(venue: AggregatorVenue): ProtocolConfig {
    if (venue === 'sdex') {
      return { ...this.baseConfig, protocolId: 'sdex', name: 'Stellar DEX' };
    }
    return { ...this.baseConfig, protocolId: 'soroswap' };
  }

  /** Pick the highest-output route from a quote. Exposed for unit tests. */
  static pickBestRoute(routes: AggregatorRoute[]): AggregatorRoute {
    if (routes.length === 0) {
      throw new Error('Cannot pick a best route from an empty list');
    }
    return routes.reduce((best, current) => {
      const cmp = new BigNumber(current.amountOut).comparedTo(best.amountOut) ?? 0;
      return cmp > 0 ? current : best;
    });
  }

  /** Apply a basis-point slippage tolerance to a quoted amountOut. */
  static applySlippage(amountOut: string, slippageBps: number): string {
    const factor = new BigNumber(BPS_DENOMINATOR - slippageBps).dividedBy(BPS_DENOMINATOR);
    return new BigNumber(amountOut).multipliedBy(factor).toFixed(7, BigNumber.ROUND_DOWN);
  }

  /** Build a {@link BestPriceResult} from a raw {@link AggregatorQuote}. */
  static fromQuote(quote: AggregatorQuote): BestPriceResult {
    return {
      quote,
      bestRoute: DexAggregator.pickBestRoute(quote.routes),
      totalAmountOut: quote.totalAmountOut,
      effectivePrice: quote.effectivePrice,
      isSplit: quote.routes.length > 1,
    };
  }
}
