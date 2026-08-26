/**
 * @fileoverview Stellar DEX (SDEX) Protocol implementation
 * @description Implementation of native Stellar DEX protocol integration.
 *   Covers path-payment swaps, order-book fetching, sell-offer management,
 *   and order-book → LiquidityPool mapping for the aggregator.
 * @author Galaxy DevKit Team
 * @version 2.0.0
 * @since 2024-04-26
 */

import {
  TransactionBuilder,
  Asset as StellarAsset,
  BASE_FEE,
  Operation,
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { BaseProtocol } from '../base-protocol.js';
import {
  Asset,
  TransactionResult,
  Position,
  HealthFactor,
  APYInfo,
  ProtocolStats,
  ProtocolConfig,
  ProtocolType,
  SwapQuote,
  LiquidityPool,
} from '../../types/defi-types.js';
import { InvalidOperationError } from '../../errors/index.js';
import {
  toStellarAsset,
  assetsMatch,
  orderBookToLiquidityPool,
  HorizonPathRecord,
  HorizonOrderBookRecord,
  ManageSellOfferParams,
  ManageSellOfferResult,
  SdexOrderBook,
  OrderBookLevel,
} from './sdex-types.js';

/**
 * Stellar DEX (SDEX) Protocol implementation.
 *
 * Implements the native Stellar DEX for the Galaxy DeFi abstraction layer.
 * Key capabilities:
 *  - `getSwapQuote()` / `swap()` – strict-send path payments.
 *  - `getOrderBook()` – live order-book snapshot from Horizon.
 *  - `manageSellOffer()` – create / modify / delete limit orders.
 *  - `getLiquidityPool()` – maps an order-book snapshot to the standard
 *    `LiquidityPool` interface so the aggregator can treat SDEX depth
 *    uniformly alongside Soroswap / Aquarius AMM pools.
 *
 * @class SdexProtocol
 * @extends BaseProtocol
 */
export class SdexProtocol extends BaseProtocol {
  private static readonly STATS_CACHE_TTL_MS = 30_000;
  private statsCache?: { value: ProtocolStats; expiresAt: number };
  /**
   * @param config - Protocol configuration. `contractAddresses` may be empty
   *   because SDEX is a native Stellar feature — no smart-contract addresses
   *   are required.
   */
  constructor(config: ProtocolConfig) {
    super(config);
  }

  // ─── BaseProtocol abstract hook implementations ───────────────────────────

  protected getProtocolType(): ProtocolType {
    return ProtocolType.DEX;
  }

  /**
   * Verify network connectivity.
   * SDEX has no contract addresses to validate, so we only check that the
   * Horizon server is reachable.
   */
  protected async validateConfiguration(): Promise<void> {
    if (!this.config.network) {
      throw new Error('Network configuration is required');
    }
    try {
      await this.horizonServer.ledgers().limit(1).call();
    } catch (error) {
      throw new Error(`Failed to connect to Horizon server: ${error}`);
    }
  }

  /** SDEX has no contract state to set up. */
  protected async setupProtocol(): Promise<void> {
    // intentionally empty
  }

  // ─── Protocol information ─────────────────────────────────────────────────

  public async getStats(): Promise<ProtocolStats> {
    this.ensureInitialized();
    if (this.statsCache && Date.now() < this.statsCache.expiresAt) {
      return this.statsCache.value;
    }

    try {
      const records = await this.fetchAllLiquidityPools();
      const depth = records.reduce((total, pool) => {
        const reserves = Array.isArray(pool.reserves) ? pool.reserves : [];
        return total.plus(reserves.reduce(
          (sum, reserve) => sum.plus(String(reserve.amount ?? '0')),
          new BigNumber(0),
        ));
      }, new BigNumber(0));

      const value: ProtocolStats = {
        // Horizon exposes reserve amounts, not a universal USD oracle. Report
        // aggregate reserve depth honestly rather than returning fake zeros.
        totalSupply: depth.toFixed(7),
        tvl: depth.toFixed(7),
        // SDEX has no lending market by definition.
        totalBorrow: '0',
        utilizationRate: 0,
        timestamp: new Date(),
      };
      this.statsCache = { value, expiresAt: Date.now() + SdexProtocol.STATS_CACHE_TTL_MS };
      return value;
    } catch (error) {
      this.handleError(error, 'getStats');
    }
  }

  private async fetchAllLiquidityPools(): Promise<Array<{ reserves?: Array<{ amount?: string }> }>> {
    const records: Array<{ reserves?: Array<{ amount?: string }> }> = [];
    let nextUrl: string | undefined = `${this.config.network.horizonUrl.replace(/\/$/, '')}/liquidity_pools?limit=200`;
    while (nextUrl) {
      const response = await fetch(nextUrl);
      if (!response.ok) throw new Error(`Horizon liquidity_pools returned ${response.status}`);
      const page = await response.json() as {
        _embedded?: { records?: Array<{ reserves?: Array<{ amount?: string }> }> };
        _links?: { next?: { href?: string } };
      };
      records.push(...(page._embedded?.records ?? []));
      nextUrl = page._links?.next?.href;
    }
    return records;
  }

  // ─── Unsupported lending operations ───────────────────────────────────────

  public async supply(): Promise<TransactionResult> {
    throw new InvalidOperationError('Supply is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'supply',
    });
  }

  public async borrow(): Promise<TransactionResult> {
    throw new InvalidOperationError('Borrow is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'borrow',
    });
  }

  public async repay(): Promise<TransactionResult> {
    throw new InvalidOperationError('Repay is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'repay',
    });
  }

  public async withdraw(): Promise<TransactionResult> {
    throw new InvalidOperationError('Withdraw is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'withdraw',
    });
  }

  // ─── Unsupported position management ──────────────────────────────────────

  public async getPosition(): Promise<Position> {
    throw new InvalidOperationError('getPosition is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getPosition',
    });
  }

  public async getHealthFactor(): Promise<HealthFactor> {
    throw new InvalidOperationError('getHealthFactor is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getHealthFactor',
    });
  }

  // ─── Unsupported lending info ──────────────────────────────────────────────

  public async getSupplyAPY(): Promise<APYInfo> {
    throw new InvalidOperationError('getSupplyAPY is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getSupplyAPY',
    });
  }

  public async getBorrowAPY(): Promise<APYInfo> {
    throw new InvalidOperationError('getBorrowAPY is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getBorrowAPY',
    });
  }

  public async getTotalSupply(): Promise<string> {
    throw new InvalidOperationError('getTotalSupply is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getTotalSupply',
    });
  }

  public async getTotalBorrow(): Promise<string> {
    throw new InvalidOperationError('getTotalBorrow is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getTotalBorrow',
    });
  }

  // ─── DEX operations ────────────────────────────────────────────────────────

  /**
   * Get a swap quote using Horizon strict-send path-finding.
   *
   * The best path is the one that maximises `destination_amount`.
   * A 1 % default slippage tolerance is applied to derive `minimumReceived`.
   *
   * @param tokenIn  - Source asset.
   * @param tokenOut - Destination asset.
   * @param amountIn - Exact amount of source asset to send.
   * @returns Swap quote with best path and minimum received amount.
   */
  public async getSwapQuote(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
  ): Promise<SwapQuote> {
    this.ensureInitialized();
    this.validateAsset(tokenIn);
    this.validateAsset(tokenOut);
    this.validateAmount(amountIn);

    if (assetsMatch(tokenIn, tokenOut)) {
      throw new Error('Source and destination assets must be different');
    }

    try {
      const sourceAsset = toStellarAsset(tokenIn);
      const destAsset = toStellarAsset(tokenOut);

      const paths = await this.horizonServer
        .strictSendPaths(sourceAsset, amountIn, [destAsset])
        .call();

      if (paths.records.length === 0) {
        throw new Error(`No path found from ${tokenIn.code} to ${tokenOut.code} on SDEX`);
      }

      // Horizon returns paths sorted by descending destination_amount; pick first.
      const bestPathRecord = paths.records[0] as unknown as HorizonPathRecord;
      const amountOut = bestPathRecord.destination_amount;
      const slippageTolerance = 0.01; // 1 % default
      const minimumReceived = new BigNumber(amountOut)
        .multipliedBy(1 - slippageTolerance)
        .toFixed(7);

      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceImpact: '0', // Horizon doesn't return price-impact explicitly
        minimumReceived,
        path: bestPathRecord.path.map((p) => {
          if (p.asset_type === 'native') return 'XLM';
          return `${p.asset_code}:${p.asset_issuer}`;
        }),
        validUntil: new Date(Date.now() + 60_000),
      };
    } catch (error) {
      this.handleError(error, 'getSwapQuote');
    }
  }

  /**
   * Execute a token swap via `PathPaymentStrictSend`.
   *
   * Returns an **unsigned** XDR transaction envelope. The caller is
   * responsible for signing and submitting it.
   *
   * @param walletAddress - Source (and destination) account public key.
   * @param _privateKey    - Unused; present for interface compatibility.
   * @param tokenIn        - Source asset.
   * @param tokenOut       - Destination asset.
   * @param amountIn       - Exact amount to send.
   * @param minAmountOut   - Minimum acceptable destination amount.
   * @returns Unsigned XDR transaction result.
   */
  public async swap(
    walletAddress: string,
    _privateKey: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    minAmountOut: string,
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(tokenIn);
    this.validateAsset(tokenOut);
    this.validateAmount(amountIn);

    try {
      const quote = await this.getSwapQuote(tokenIn, tokenOut, amountIn);
      const sourceAsset = toStellarAsset(tokenIn);
      const destAsset = toStellarAsset(tokenOut);

      // Rebuild intermediate path from the quote (strip head/tail assets).
      const intermediatePath = quote.path.slice(1, -1).map((p) => {
        if (p === 'XLM') return StellarAsset.native();
        const [code, issuer] = p.split(':');
        return new StellarAsset(code, issuer);
      });

      const operation = Operation.pathPaymentStrictSend({
        sendAsset: sourceAsset,
        sendAmount: amountIn,
        destination: walletAddress,
        destAsset,
        destMin: minAmountOut,
        path: intermediatePath,
      });

      const account = await this.horizonServer.loadAccount(walletAddress);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(180)
        .build();

      return this.buildTransactionResult('pending', 'pending', 0, {
        operation: 'swap',
        protocol: 'sdex',
        xdr: transaction.toXDR(),
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        path: quote.path,
      });
    } catch (error) {
      this.handleError(error, 'swap');
    }
  }

  // ─── Order book ────────────────────────────────────────────────────────────

  /**
   * Fetch a live order-book snapshot for an asset pair from Horizon.
   *
   * @param base    - The base (selling) asset.
   * @param counter - The counter (buying) asset.
   * @param limit   - Maximum number of price levels per side (default 20).
   * @returns An `SdexOrderBook` snapshot.
   */
  public async getOrderBook(
    base: Asset,
    counter: Asset,
    limit = 20,
  ): Promise<SdexOrderBook> {
    this.ensureInitialized();
    this.validateAsset(base);
    this.validateAsset(counter);

    if (assetsMatch(base, counter)) {
      throw new Error('Base and counter assets must be different');
    }

    try {
      const baseAsset = toStellarAsset(base);
      const counterAsset = toStellarAsset(counter);

      const raw = await this.horizonServer
        .orderbook(baseAsset, counterAsset)
        .limit(limit)
        .call() as unknown as HorizonOrderBookRecord;

      const asks: OrderBookLevel[] = (raw.asks ?? []).map((a) => ({
        price: a.price,
        amount: a.amount,
      }));

      const bids: OrderBookLevel[] = (raw.bids ?? []).map((b) => ({
        price: b.price,
        amount: b.amount,
      }));

      return {
        base,
        counter,
        asks,
        bids,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.handleError(error, 'getOrderBook');
    }
  }

  // ─── Sell offer management ─────────────────────────────────────────────────

  /**
   * Build an unsigned transaction that creates, modifies, or deletes an SDEX
   * sell offer using `manageSellOffer`.
   *
   * Passing `amount = '0'` with an existing `offerId` deletes the offer.
   * Passing `offerId = 0` (or omitting it) creates a new offer.
   * Passing a non-zero `offerId` with `amount > 0` modifies the offer.
   *
   * @param walletAddress - Offer creator / owner public key.
   * @param _privateKey    - Unused; present for interface compatibility.
   * @param params         - Offer parameters (selling, buying, amount, price, offerId).
   * @returns Unsigned XDR transaction and action metadata.
   */
  public async manageSellOffer(
    walletAddress: string,
    _privateKey: string,
    params: ManageSellOfferParams,
  ): Promise<ManageSellOfferResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(params.selling);
    this.validateAsset(params.buying);

    if (assetsMatch(params.selling, params.buying)) {
      throw new Error('Selling and buying assets must be different');
    }

    const amountNum = parseFloat(params.amount);
    if (isNaN(amountNum) || amountNum < 0) {
      throw new Error('Offer amount must be a non-negative number');
    }

    const priceNum = parseFloat(params.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new Error('Offer price must be a positive number');
    }

    const offerId = params.offerId ?? 0;
    let action: ManageSellOfferResult['action'];
    if (amountNum === 0 && offerId !== 0) {
      action = 'delete';
    } else if (offerId !== 0) {
      action = 'modify';
    } else {
      action = 'create';
    }

    try {
      const sellingAsset = toStellarAsset(params.selling);
      const buyingAsset = toStellarAsset(params.buying);

      const operation = Operation.manageSellOffer({
        selling: sellingAsset,
        buying: buyingAsset,
        amount: params.amount,
        price: params.price,
        offerId,
      });

      const account = await this.horizonServer.loadAccount(walletAddress);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(180)
        .build();

      return {
        xdr: transaction.toXDR(),
        action,
        offerId,
      };
    } catch (error) {
      this.handleError(error, 'manageSellOffer');
    }
  }

  // ─── LiquidityPool interface ───────────────────────────────────────────────

  /**
   * Return a `LiquidityPool`-compatible view of the SDEX order book for a
   * given asset pair. This allows the aggregator and smart-router to reason
   * about SDEX depth using the same interface they use for Soroswap / Aquarius
   * AMM pools.
   *
   * Internally fetches the order book and delegates to
   * `orderBookToLiquidityPool()`.
   *
   * @param tokenA - First asset of the pair.
   * @param tokenB - Second asset of the pair.
   * @returns `LiquidityPool` derived from the current order book depth.
   */
  public async getLiquidityPool(tokenA: Asset, tokenB: Asset): Promise<LiquidityPool> {
    this.ensureInitialized();
    this.validateAsset(tokenA);
    this.validateAsset(tokenB);

    if (assetsMatch(tokenA, tokenB)) {
      throw new Error('tokenA and tokenB must be different assets');
    }

    try {
      const orderBook = await this.getOrderBook(tokenA, tokenB);
      return orderBookToLiquidityPool(orderBook);
    } catch (error) {
      this.handleError(error, 'getLiquidityPool');
    }
  }
}
