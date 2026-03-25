/**
 * @fileoverview DEX Aggregator Service
 * @description Coordinates price discovery across SDEX (Horizon path payments) and
 *   AMM protocols (Soroswap, Aquarius) to find the best swap route for any asset pair.
 *   Returns unsigned XDR for client-side signing.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import BigNumber from 'bignumber.js';
import { Asset as StellarAsset, Horizon } from '@stellar/stellar-sdk';
import {
  ProtocolFactory,
  ProtocolConfig,
  Asset,
} from '@galaxy-kj/core-defi-protocols';

import {
  LiquiditySource,
  RouteQuote,
  AggregatedQuote,
  AggregateQuoteParams,
  AggregatedSwapResult,
  AggregateSwapParams,
  PriceComparison,
  SourcePrice,
} from '../types/aggregator.types.js';

/** Price impact threshold above which a high-impact warning is raised (%) */
const HIGH_IMPACT_THRESHOLD = 5;

/** Default slippage applied to min amounts when not provided (5%) */
const DEFAULT_SLIPPAGE = 0.05;

/**
 * DEX Aggregator Service
 *
 * Queries SDEX via Horizon path payments and Soroswap AMM to find the best
 * execution price for a given asset pair. Aquarius support is stubbed and
 * ready for integration once the SDK is available.
 *
 * @example
 * ```ts
 * const aggregator = new DexAggregatorService(horizonServer, soroswapConfig);
 *
 * const quote = await aggregator.getAggregatedQuote({
 *   assetIn: { code: 'XLM', type: 'native' },
 *   assetOut: { code: 'USDC', issuer: 'GA5Z...', type: 'credit_alphanum4' },
 *   amountIn: '100',
 * });
 *
 * console.log(quote.bestRoute.source); // 'soroswap' or 'sdex'
 * console.log(quote.bestRoute.amountOut);
 * ```
 */
export class DexAggregatorService {
  private horizonServer: Horizon.Server;
  private soroswapConfig: ProtocolConfig;

  /**
   * @param horizonServer  Horizon.Server instance (used for SDEX path finding)
   * @param soroswapConfig ProtocolConfig for the Soroswap protocol
   */
  constructor(horizonServer: Horizon.Server, soroswapConfig: ProtocolConfig) {
    this.horizonServer = horizonServer;
    this.soroswapConfig = soroswapConfig;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Fetch and compare quotes from all requested liquidity sources.
   * Returns routes sorted best-first (highest amountOut).
   */
  async getAggregatedQuote(params: AggregateQuoteParams): Promise<AggregatedQuote> {
    const sources = params.sources ?? (['sdex', 'soroswap'] as LiquiditySource[]);

    const quotePromises = sources.map((source) =>
      this.fetchQuoteFromSource(source, params).catch((err) => {
        // Swallow individual source errors — partial results are still useful
        console.warn(`[DexAggregator] ${source} quote failed: ${err?.message ?? err}`);
        return null;
      })
    );

    const settled = await Promise.all(quotePromises);
    const routes = settled.filter((q): q is RouteQuote => q !== null);

    if (routes.length === 0) {
      throw new Error(
        `No routes found for ${this.assetLabel(params.assetIn)} → ${this.assetLabel(params.assetOut)}`
      );
    }

    // Sort: highest amountOut first
    routes.sort((a, b) => new BigNumber(b.amountOut).comparedTo(a.amountOut));

    const bestRoute = routes[0];

    return {
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountIn,
      routes,
      bestRoute,
      highImpactWarning: parseFloat(bestRoute.priceImpact) >= HIGH_IMPACT_THRESHOLD,
      timestamp: new Date(),
    };
  }

  /**
   * Compare prices across all sources without executing anything.
   */
  async comparePrices(
    assetIn: Asset,
    assetOut: Asset,
    amountIn: string,
    sources: LiquiditySource[] = ['sdex', 'soroswap']
  ): Promise<PriceComparison> {
    const params: AggregateQuoteParams = { assetIn, assetOut, amountIn, sources };

    const pricePromises = sources.map(async (source): Promise<SourcePrice> => {
      try {
        const quote = await this.fetchQuoteFromSource(source, params);
        return { source, price: quote.price, available: true };
      } catch (err: any) {
        return { source, price: '0', available: false, error: err?.message ?? String(err) };
      }
    });

    const prices = await Promise.all(pricePromises);

    const available = prices.filter((p) => p.available);
    const bestSource =
      available.length > 0
        ? available.reduce((best, p) =>
            new BigNumber(p.price).isGreaterThan(best.price) ? p : best
          ).source
        : sources[0];

    return {
      assetIn,
      assetOut,
      amountIn,
      prices,
      bestSource,
      timestamp: new Date(),
    };
  }

  /**
   * Execute a swap using the best available route (or a preferred source).
   * Returns an unsigned XDR transaction for client-side signing.
   */
  async executeAggregatedSwap(params: AggregateSwapParams): Promise<AggregatedSwapResult> {
    let sourceToUse: LiquiditySource;
    let quote: RouteQuote;

    if (params.preferredSource) {
      sourceToUse = params.preferredSource;
      quote = await this.fetchQuoteFromSource(sourceToUse, {
        assetIn: params.assetIn,
        assetOut: params.assetOut,
        amountIn: params.amountIn,
      });
    } else {
      const aggregated = await this.getAggregatedQuote({
        assetIn: params.assetIn,
        assetOut: params.assetOut,
        amountIn: params.amountIn,
      });
      quote = aggregated.bestRoute;
      sourceToUse = quote.source;
    }

    const xdr = await this.buildSwapTransaction(sourceToUse, params, quote);

    return {
      source: sourceToUse,
      xdr,
      quote,
      highImpactWarning: parseFloat(quote.priceImpact) >= HIGH_IMPACT_THRESHOLD,
    };
  }

  // ---------------------------------------------------------------------------
  // Source-specific quote fetchers
  // ---------------------------------------------------------------------------

  private async fetchQuoteFromSource(
    source: LiquiditySource,
    params: AggregateQuoteParams
  ): Promise<RouteQuote> {
    switch (source) {
      case 'sdex':
        return this.fetchSdexQuote(params);
      case 'soroswap':
        return this.fetchSoroswapQuote(params);
      case 'aquarius':
        return this.fetchAquariusQuote(params);
      default:
        throw new Error(`Unknown liquidity source: ${source}`);
    }
  }

  /**
   * Fetch a quote from SDEX via Horizon strict-send path payments.
   */
  private async fetchSdexQuote(params: AggregateQuoteParams): Promise<RouteQuote> {
    const stellarAssetIn = this.toStellarAsset(params.assetIn);
    const stellarAssetOut = this.toStellarAsset(params.assetOut);

    const base = (this.horizonServer as any).serverURL ?? (this.horizonServer as any).url;
    const baseUrl = typeof base === 'string' ? base : (base?.toString?.() ?? '');

    const assetInParams = this.stellarAssetToQueryParams(stellarAssetIn, 'source');
    const assetOutParams = this.stellarAssetToQueryParams(stellarAssetOut, 'destination');

    const q = new URLSearchParams({
      ...assetInParams,
      source_amount: params.amountIn,
      ...assetOutParams,
      limit: '5',
    });

    const url = `${baseUrl.replace(/\/$/, '')}/paths/strict-send?${q.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`SDEX path payment request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const records: any[] = json._embedded?.records ?? json.records ?? [];

    if (records.length === 0) {
      throw new Error('No SDEX path found');
    }

    // Pick the path with the highest destination amount
    const best = records.reduce((prev: any, curr: any) =>
      new BigNumber(curr.destination_amount).isGreaterThan(prev.destination_amount) ? curr : prev
    );

    const amountOut = best.destination_amount as string;
    const price = new BigNumber(params.amountIn).isZero()
      ? '0'
      : new BigNumber(amountOut).dividedBy(params.amountIn).toFixed(7);

    const pathAssets: string[] = (best.path ?? []).map((p: any) =>
      p.asset_type === 'native' ? 'native' : `${p.asset_code}:${p.asset_issuer}`
    );

    const pathDepth = pathAssets.length;

    return {
      source: 'sdex',
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountIn,
      amountOut,
      price,
      priceImpact: '0', // Horizon does not expose price impact
      fee: '0', // SDEX fee is embedded in path
      path: pathAssets,
      liquidityDepth: pathDepth <= 1 ? 'high' : pathDepth <= 2 ? 'medium' : 'low',
      fetchedAt: new Date(),
    };
  }

  /**
   * Fetch a quote from Soroswap via getSwapQuote().
   */
  private async fetchSoroswapQuote(params: AggregateQuoteParams): Promise<RouteQuote> {
    const factory = ProtocolFactory.getInstance();
    const protocol = factory.createProtocol(this.soroswapConfig) as any;
    await protocol.initialize();

    if (typeof protocol.getSwapQuote !== 'function') {
      throw new Error('Soroswap protocol does not implement getSwapQuote');
    }

    const swapQuote = await protocol.getSwapQuote(
      params.assetIn,
      params.assetOut,
      params.amountIn
    );

    const price = new BigNumber(params.amountIn).isZero()
      ? '0'
      : new BigNumber(swapQuote.amountOut).dividedBy(params.amountIn).toFixed(7);

    return {
      source: 'soroswap',
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountIn: params.amountIn,
      amountOut: swapQuote.amountOut,
      price,
      priceImpact: swapQuote.priceImpact ?? '0',
      fee: '0.003', // Soroswap default 0.3% fee
      path: swapQuote.path ?? [],
      liquidityDepth: 'high',
      fetchedAt: new Date(),
    };
  }

  /**
   * Aquarius quote stub — ready for integration once the Aquarius SDK is available.
   * See https://github.com/AquaIssuer for the upcoming SDK package.
   */
  private async fetchAquariusQuote(_params: AggregateQuoteParams): Promise<RouteQuote> {
    throw new Error(
      'Aquarius integration is not yet available. The Aquarius SDK is pending release (PROTOCOL_IDS.AQUARIUS is reserved).'
    );
  }

  // ---------------------------------------------------------------------------
  // Transaction builders
  // ---------------------------------------------------------------------------

  /**
   * Build an unsigned XDR swap transaction for the chosen source.
   */
  private async buildSwapTransaction(
    source: LiquiditySource,
    params: AggregateSwapParams,
    _quote: RouteQuote
  ): Promise<string> {
    switch (source) {
      case 'sdex':
        return this.buildSdexSwapTransaction(params);
      case 'soroswap':
        return this.buildSoroswapSwapTransaction(params);
      default:
        throw new Error(`Cannot build swap transaction for source: ${source}`);
    }
  }

  /**
   * Build a Horizon strict-send path payment transaction (unsigned XDR).
   */
  private async buildSdexSwapTransaction(params: AggregateSwapParams): Promise<string> {
    const { TransactionBuilder, Operation, BASE_FEE } = await import('@stellar/stellar-sdk');

    const sourceAccount = await this.horizonServer.loadAccount(params.signerPublicKey);
    const stellarAssetIn = this.toStellarAsset(params.assetIn);
    const stellarAssetOut = this.toStellarAsset(params.assetOut);

    const op = Operation.pathPaymentStrictSend({
      sendAsset: stellarAssetIn,
      sendAmount: params.amountIn,
      destination: params.signerPublicKey,
      destAsset: stellarAssetOut,
      destMin: params.minAmountOut,
      path: [],
    });

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.soroswapConfig.network.passphrase,
    })
      .addOperation(op)
      .setTimeout(180)
      .build();

    return tx.toXDR();
  }

  /**
   * Build a Soroswap swap transaction (unsigned XDR via prepareTransaction).
   */
  private async buildSoroswapSwapTransaction(params: AggregateSwapParams): Promise<string> {
    const factory = ProtocolFactory.getInstance();
    const protocol = factory.createProtocol(this.soroswapConfig) as any;
    await protocol.initialize();

    const result = await protocol.swap(
      params.signerPublicKey,
      '',
      params.assetIn,
      params.assetOut,
      params.amountIn,
      params.minAmountOut
    );

    return result.hash;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private toStellarAsset(asset: Asset): StellarAsset {
    if (asset.type === 'native') return StellarAsset.native();
    return new StellarAsset(asset.code, asset.issuer!);
  }

  private stellarAssetToQueryParams(
    asset: StellarAsset,
    prefix: 'source' | 'destination'
  ): Record<string, string> {
    if (asset.isNative()) {
      return { [`${prefix}_asset_type`]: 'native' };
    }
    return {
      [`${prefix}_asset_type`]: 'credit_alphanum4',
      [`${prefix}_asset_code`]: asset.getCode(),
      [`${prefix}_asset_issuer`]: asset.getIssuer(),
    };
  }

  private assetLabel(asset: Asset): string {
    return asset.type === 'native' ? 'XLM' : `${asset.code}:${asset.issuer ?? ''}`;
  }

  /**
   * Apply default slippage to produce a minimum received amount.
   * @param amount   Estimated output amount
   * @param slippage Fraction to deduct, e.g. 0.05 for 5%
   */
  static applySlippage(amount: string, slippage: number = DEFAULT_SLIPPAGE): string {
    return new BigNumber(amount).times(1 - slippage).toFixed(7);
  }
}
