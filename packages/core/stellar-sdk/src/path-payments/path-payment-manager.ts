/**
 * @fileoverview Path Payment Manager
 * @description Path finding, swap execution, slippage protection, and analytics
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Horizon,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';
import {
  PaymentPath,
  SwapParams,
  SwapResult,
  SwapEstimate,
  SwapType,
  StrictSendPathParams,
  StrictReceivePathParams,
  SwapAnalyticsRecord,
  PathAnalytics,
  PathCacheEntry,
  PathPaymentManagerOptions,
  HIGH_PRICE_IMPACT_THRESHOLD,
  PathPaymentError,
} from './types.js';
import { Wallet } from '../types/stellar-types.js';
import { decryptPrivateKeyToString } from '../utils/encryption.utils.js';

/** Default path cache TTL in milliseconds (5 minutes) */
const DEFAULT_PATH_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_PATH_CACHE_MAX_ENTRIES = 100;
const DEFAULT_VOLATILITY_LOOKBACK = 20;
const DEFAULT_LARGE_SWAP_AMOUNT_THRESHOLD = '10000';
const MAX_SLIPPAGE_PERCENT = 50;
const DEFAULT_SLIPPAGE_PERCENT = 1;

export { PathPaymentError };

/**
 * Path Payment Manager – find paths, rank by price, execute swaps with slippage protection
 */
export class PathPaymentManager {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private pathCache: Map<string, PathCacheEntry> = new Map();
  private inFlightPathRequests: Map<string, Promise<PaymentPath[]>> = new Map();
  private pathCacheTtlMs: number;
  private pathCacheMaxEntries: number;
  private volatilityLookback: number;
  private largeSwapAmountThreshold: BigNumber;
  private swapHistory: SwapAnalyticsRecord[] = [];
  private readonly maxHistorySize = 1000;

  constructor(
    server: Horizon.Server,
    networkPassphrase: string,
    options?: PathPaymentManagerOptions
  ) {
    this.server = server;
    this.networkPassphrase = networkPassphrase;
    this.pathCacheTtlMs = options?.pathCacheTtlMs ?? DEFAULT_PATH_CACHE_TTL_MS;
    this.pathCacheMaxEntries = options?.pathCacheMaxEntries ?? DEFAULT_PATH_CACHE_MAX_ENTRIES;
    this.volatilityLookback = options?.volatilityLookback ?? DEFAULT_VOLATILITY_LOOKBACK;
    this.largeSwapAmountThreshold = new BigNumber(
      options?.largeSwapAmountThreshold ?? DEFAULT_LARGE_SWAP_AMOUNT_THRESHOLD
    );
  }

  /**
   * Find available payment paths (strict send: fixed source amount)
   */
  async findPaths(params: {
    sourceAsset: Asset;
    destAsset: Asset;
    amount: string;
    type: 'strict_send' | 'strict_receive';
    limit?: number;
    destinationAccount?: string;
    sourceAccount?: string;
  }): Promise<PaymentPath[]> {
    this.assertAmount(params.amount);
    const limit = params.limit ?? 15;
    const cacheKey = this.getPathCacheKey(
      params.sourceAsset,
      params.destAsset,
      params.amount,
      params.type,
      limit,
      params.destinationAccount,
      params.sourceAccount,
    );
    const cached = this.getCachedPaths(cacheKey);
    if (cached) return cached;

    const queued = this.inFlightPathRequests.get(cacheKey);
    if (queued) return queued;

    const request = (async () => {
      const paths =
        params.type === 'strict_send'
          ? await this.fetchStrictSendPaths({
            sourceAsset: params.sourceAsset,
            sourceAmount: params.amount,
            destinationAsset: params.destAsset,
            destinationAccount: params.destinationAccount,
            limit,
          })
          : await this.fetchStrictReceivePaths({
            sourceAsset: params.sourceAsset,
            destinationAsset: params.destAsset,
            destinationAmount: params.amount,
            sourceAccount: params.sourceAccount,
            limit,
          });

      this.setCachedPaths(cacheKey, paths);
      return paths;
    })();

    this.inFlightPathRequests.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlightPathRequests.delete(cacheKey);
    }
  }

  /**
   * Get best path from a list (best destination amount for strict send, best source amount for strict receive)
   */
  async getBestPath(paths: PaymentPath[], type: SwapType): Promise<PaymentPath | null> {
    if (paths.length === 0) return null;
    const ranked = this.rankPathsByPrice(paths, type);
    return ranked[0] ?? null;
  }

  /**
   * Execute a path payment (swap)
   */
  async executeSwap(
    wallet: Wallet,
    params: SwapParams,
    password: string,
    sourceAccountId: string
  ): Promise<SwapResult> {
    this.assertSwapParams(params);
    const paths = params.customPath
      ? [await this.resolveCustomPath(params)]
      : await this.findPaths({
        sourceAsset: params.sendAsset,
        destAsset: params.destAsset,
        amount: params.amount,
        type: params.type,
      });

    const bestPath = params.customPath
      ? paths[0]
      : await this.getBestPath(paths, params.type);

    if (!bestPath) {
      throw new PathPaymentError('No payment path found', 'NO_LIQUIDITY');
    }

    const estimate = this.estimateSwapFromPath(bestPath, params);
    this.validateSlippageProtection(params, estimate);

    const keypair = Keypair.fromSecret(await decryptPrivateKeyToString(wallet.privateKey, password));
    const sourceAccount = await this.server.loadAccount(sourceAccountId);
    const destinationAccountId = params.destinationAccount ?? sourceAccountId;

    const pathAssets = bestPath.path || [];
    const sendMax = params.type === 'strict_receive' ? estimate.maximumCost! : params.amount;

    const op =
      params.type === 'strict_send'
        ? Operation.pathPaymentStrictSend({
          sendAsset: params.sendAsset,
          sendAmount: params.amount,
          destination: destinationAccountId,
          destAsset: params.destAsset,
          destMin: estimate.minimumReceived!,
          path: pathAssets,
        })
        : Operation.pathPaymentStrictReceive({
          sendAsset: params.sendAsset,
          sendMax,
          destination: destinationAccountId,
          destAsset: params.destAsset,
          destAmount: params.amount,
          path: pathAssets,
        });

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    tx.sign(keypair);
    let result: { hash: string };
    try {
      result = await this.server.submitTransaction(tx);
    } catch (err) {
      this.recordSwapAnalytics({
        path: estimate.path,
        inputAmount: params.type === 'strict_send' ? params.amount : bestPath.source_amount,
        outputAmount: params.type === 'strict_send' ? bestPath.destination_amount : params.amount,
        price: bestPath.price,
        priceImpact: bestPath.priceImpact,
        transactionHash: '',
        slippageApplied: (estimate.volatilityAdjustedSlippage ?? params.maxSlippage ?? DEFAULT_SLIPPAGE_PERCENT).toFixed(2),
      }, false);
      throw new PathPaymentError(
        `Path payment submission failed: ${err instanceof Error ? err.message : String(err)}`,
        'SUBMIT_FAILED',
        { cause: err },
      );
    }

    const swapResult: SwapResult = {
      path: [params.sendAsset, ...pathAssets, params.destAsset],
      inputAmount: params.type === 'strict_send' ? params.amount : bestPath.source_amount,
      outputAmount: params.type === 'strict_send' ? bestPath.destination_amount : params.amount,
      price: bestPath.price,
      priceImpact: bestPath.priceImpact,
      transactionHash: result.hash,
      highImpactWarning: parseFloat(bestPath.priceImpact) >= HIGH_PRICE_IMPACT_THRESHOLD,
      slippageApplied: (estimate.volatilityAdjustedSlippage ?? params.maxSlippage ?? 1).toFixed(2),
    };

    this.recordSwapAnalytics(swapResult, true, result.hash);
    this.invalidatePairCacheIfLargeSwap(params, swapResult);
    return swapResult;
  }

  /**
   * Estimate swap output/input and price impact (no execution)
   */
  async estimateSwap(params: SwapParams): Promise<SwapEstimate> {
    this.assertSwapParams(params);
    const paths = params.customPath
      ? [await this.resolveCustomPath(params)]
      : await this.findPaths({
        sourceAsset: params.sendAsset,
        destAsset: params.destAsset,
        amount: params.amount,
        type: params.type,
      });

    const bestPath = params.customPath ? paths[0] : await this.getBestPath(paths, params.type);
    if (!bestPath) {
      throw new PathPaymentError('No payment path found for estimate', 'NO_LIQUIDITY');
    }
    return this.estimateSwapFromPath(bestPath, params);
  }

  /**
   * Get swap price for a given path (effective rate)
   */
  getSwapPrice(path: PaymentPath, type: SwapType): string {
    return path.price;
  }

  /**
   * Calculate price impact for a path (percentage)
   */
  calculatePriceImpact(path: PaymentPath): string {
    return path.priceImpact;
  }

  /**
   * Check if price impact is high and should warn
   */
  isHighPriceImpact(path: PaymentPath): boolean {
    return parseFloat(path.priceImpact) >= HIGH_PRICE_IMPACT_THRESHOLD;
  }

  /**
   * Get swap analytics (historical and path success rates)
   */
  getSwapAnalytics(): { history: SwapAnalyticsRecord[]; pathRates: PathAnalytics[] } {
    const pathMap = new Map<string, PathAnalytics>();
    for (const record of this.swapHistory) {
      const key = record.pathHash;
      let analytics = pathMap.get(key);
      if (!analytics) {
        analytics = {
          pathHash: key,
          path: [],
          successCount: 0,
          failureCount: 0,
          successRate: 0,
          averagePrice: '0',
          averagePriceImpact: '0',
          lastUsed: record.timestamp,
        };
        pathMap.set(key, analytics);
      }
      if (record.success) analytics.successCount++;
      else analytics.failureCount++;
      analytics.lastUsed = record.timestamp;
    }
    for (const a of pathMap.values()) {
      a.successRate = a.successCount / (a.successCount + a.failureCount) || 0;
    }
    return {
      history: [...this.swapHistory],
      pathRates: Array.from(pathMap.values()),
    };
  }

  /**
   * Clear path cache (e.g. after liquidity changes)
   */
  clearPathCache(): void {
    this.pathCache.clear();
  }

  // --- Private helpers ---

  private getPathCacheKey(
    source: Asset,
    dest: Asset,
    amount: string,
    type: string,
    limit: number,
    destinationAccount?: string,
    sourceAccount?: string,
  ): string {
    const s = this.assetToString(source);
    const d = this.assetToString(dest);
    return `${type}:${s}:${d}:${amount}:${limit}:${destinationAccount ?? '-'}:${sourceAccount ?? '-'}`;
  }

  private assertAmount(amount: string): void {
    if (!/^\d+(\.\d+)?$/.test(amount) || !new BigNumber(amount).isGreaterThan(0)) {
      throw new PathPaymentError(
        `amount must be a positive decimal string (received "${amount}")`,
        'INVALID_AMOUNT',
      );
    }
  }

  private assertSlippage(slippage: number): void {
    if (!Number.isFinite(slippage) || slippage < 0 || slippage > MAX_SLIPPAGE_PERCENT) {
      throw new PathPaymentError(
        `maxSlippage must be a percent between 0 and ${MAX_SLIPPAGE_PERCENT} (received ${slippage})`,
        'INVALID_SLIPPAGE',
      );
    }
  }

  private assertSwapParams(params: SwapParams): void {
    this.assertAmount(params.amount);
    this.assertSlippage(params.maxSlippage ?? DEFAULT_SLIPPAGE_PERCENT);
    if (params.sendAsset.equals(params.destAsset)) {
      throw new PathPaymentError('Send and destination assets must be different', 'SAME_ASSET');
    }
  }

  private assetToString(asset: Asset): string {
    if (asset.isNative()) return 'native';
    return `${asset.getCode()}:${asset.getIssuer()}`;
  }

  private getCachedPaths(key: string): PaymentPath[] | null {
    const entry = this.pathCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttlMs) {
      this.pathCache.delete(key);
      return null;
    }
    entry.lastAccessedAt = Date.now();
    entry.hits += 1;
    return entry.paths;
  }

  private setCachedPaths(key: string, paths: PaymentPath[]): void {
    this.pruneCacheIfNeeded(key);
    this.pathCache.set(key, {
      paths,
      fetchedAt: Date.now(),
      lastAccessedAt: Date.now(),
      hits: 0,
      ttlMs: this.pathCacheTtlMs,
    });
  }

  private pruneCacheIfNeeded(incomingKey: string): void {
    if (this.pathCache.has(incomingKey) || this.pathCache.size < this.pathCacheMaxEntries) return;

    let oldestKey: string | null = null;
    let oldestAccess = Number.POSITIVE_INFINITY;

    for (const [key, entry] of this.pathCache.entries()) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.pathCache.delete(oldestKey);
    }
  }

  private async fetchStrictSendPaths(
    params: StrictSendPathParams
  ): Promise<PaymentPath[]> {
    const destination = params.destinationAccount ?? [params.destinationAsset];
    try {
      const response = await this.server
        .strictSendPaths(params.sourceAsset, params.sourceAmount, destination)
        .limit(params.limit ?? 15)
        .call();
      return this.recordsToPaths(response.records ?? [], 'strict_send');
    } catch (err) {
      if (err instanceof PathPaymentError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new PathPaymentError(`Horizon strict-send query failed: ${message}`, 'HORIZON_ERROR');
    }
  }

  private async fetchStrictReceivePaths(
    params: StrictReceivePathParams
  ): Promise<PaymentPath[]> {
    const source = params.sourceAccount ?? [params.sourceAsset];
    try {
      const response = await this.server
        .strictReceivePaths(source, params.destinationAsset, params.destinationAmount)
        .limit(params.limit ?? 15)
        .call();
      return this.recordsToPaths(response.records ?? [], 'strict_receive');
    } catch (err) {
      if (err instanceof PathPaymentError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new PathPaymentError(`Horizon strict-receive query failed: ${message}`, 'HORIZON_ERROR');
    }
  }

  private recordsToPaths(records: unknown[], type: SwapType): PaymentPath[] {
    if (records.length === 0) {
      throw new PathPaymentError('No payment path found', 'NO_LIQUIDITY');
    }
    return records.map((record) => this.horizonPathToPaymentPath(record, type));
  }

  private horizonAssetToSdk(rec: any): Asset {
    if (rec.asset_type === 'native') return Asset.native();
    return new Asset(rec.asset_code, rec.asset_issuer);
  }

  private horizonPathToPaymentPath(rec: any, type: SwapType): PaymentPath {
    const pathRecs = rec.path || [];
    const path = pathRecs.map((p: any) => this.horizonAssetToSdk(typeof p === 'object' ? p : { asset_type: p }));
    const src = rec.source_asset ?? {
      asset_type: rec.source_asset_type,
      asset_code: rec.source_asset_code,
      asset_issuer: rec.source_asset_issuer,
    };
    const dst = rec.destination_asset ?? {
      asset_type: rec.destination_asset_type,
      asset_code: rec.destination_asset_code,
      asset_issuer: rec.destination_asset_issuer,
    };
    const sourceAsset = this.horizonAssetToSdk(src);
    const destAsset = this.horizonAssetToSdk(dst);
    const sourceAmount = rec.source_amount ?? '0';
    const destAmount = rec.destination_amount ?? '0';
    const price = new BigNumber(sourceAmount).isZero() ? '0' : new BigNumber(destAmount).dividedBy(sourceAmount).toFixed(7);
    const pairKey = this.getPairKey(sourceAsset, destAsset);
    const priceImpact = this.calculateHistoricalPriceImpact(pairKey, price);
    return {
      source_asset: sourceAsset,
      destination_asset: destAsset,
      path,
      source_amount: sourceAmount,
      destination_amount: destAmount,
      price,
      priceImpact,
      pathDepth: path.length,
      liquidityDepth: path.length <= 1 ? 'high' : path.length <= 2 ? 'medium' : 'low',
    };
  }

  private rankPathsByPrice(paths: PaymentPath[], type: SwapType): PaymentPath[] {
    return [...paths].sort((a, b) => {
      const byAmount = type === 'strict_send'
        ? new BigNumber(b.destination_amount).comparedTo(a.destination_amount)
        : new BigNumber(a.source_amount).comparedTo(b.source_amount);
      if (byAmount) return byAmount;
      return a.path.length - b.path.length;
    });
  }

  private async resolveCustomPath(params: SwapParams): Promise<PaymentPath> {
    const paths = await this.findPaths({
      sourceAsset: params.sendAsset,
      destAsset: params.destAsset,
      amount: params.amount,
      type: params.type,
    });
    const requested = params.customPath ?? [];
    const match = paths.find((candidate) => candidate.path.length === requested.length &&
      candidate.path.every((asset, index) => asset.equals(requested[index])));
    if (!match || !this.hasUsableQuote(match, params.type)) {
      throw new PathPaymentError('Unable to obtain a safe Horizon quote for the custom payment path', 'NO_LIQUIDITY');
    }
    return match;
  }

  private hasUsableQuote(path: PaymentPath, type: SwapType): boolean {
    const counterAmount = type === 'strict_send' ? path.destination_amount : path.source_amount;
    return Number.isFinite(Number(counterAmount)) && new BigNumber(counterAmount).isGreaterThan(0) &&
      Number.isFinite(Number(path.price)) && new BigNumber(path.price).isGreaterThan(0) &&
      Number.isFinite(Number(path.priceImpact));
  }

  private estimateSwapFromPath(path: PaymentPath, params: SwapParams): SwapEstimate {
    const baseSlippage = params.maxSlippage ?? 1;
    const historicalVolatility = this.calculateHistoricalVolatility(this.getPairKey(path.source_asset, path.destination_asset));
    const volatilityPercent = historicalVolatility.times(100);
    const volatilityBuffer = params.maxSlippage === undefined
      ? BigNumber.minimum(volatilityPercent, new BigNumber(10))
      : new BigNumber(0);
    const adjustedSlippage = new BigNumber(baseSlippage).plus(volatilityBuffer);
    const minReceived = new BigNumber(path.destination_amount)
      .times(new BigNumber(1).minus(adjustedSlippage.dividedBy(100)))
      .decimalPlaces(7, BigNumber.ROUND_DOWN)
      .toFixed(7);
    const maxCost = new BigNumber(path.source_amount)
      .times(new BigNumber(1).plus(adjustedSlippage.dividedBy(100)))
      .decimalPlaces(7, BigNumber.ROUND_UP)
      .toFixed(7);
    if (!new BigNumber(minReceived).isGreaterThan(0) || !new BigNumber(maxCost).isGreaterThan(0)) {
      throw new PathPaymentError('Slippage leaves a non-positive bound', 'INVALID_SLIPPAGE');
    }
    const highImpact = parseFloat(path.priceImpact) >= HIGH_PRICE_IMPACT_THRESHOLD;
    const suggestedMaxSlippage = BigNumber.maximum(
      new BigNumber(baseSlippage),
      new BigNumber(baseSlippage).plus(BigNumber.minimum(volatilityPercent, new BigNumber(10)))
    );

    return {
      path: [path.source_asset, ...path.path, path.destination_asset],
      inputAmount: path.source_amount,
      outputAmount: path.destination_amount,
      price: path.price,
      priceImpact: path.priceImpact,
      minimumReceived: minReceived,
      maximumCost: maxCost,
      highImpact,
      historicalVolatility: volatilityPercent.toFixed(2),
      volatilityAdjustedSlippage: Number(adjustedSlippage.toFixed(2)),
      suggestedMaxSlippage: Number(
        BigNumber.maximum(suggestedMaxSlippage, new BigNumber(highImpact ? 2 : baseSlippage)).toFixed(2)
      ),
    };
  }

  private validateSlippageProtection(params: SwapParams, estimate: SwapEstimate): void {
    this.assertSlippage(params.maxSlippage ?? DEFAULT_SLIPPAGE_PERCENT);
    const requiredAmount = params.type === 'strict_send' ? estimate.minimumReceived : estimate.maximumCost;
    if (!requiredAmount || !Number.isFinite(Number(requiredAmount)) || new BigNumber(requiredAmount).isLessThanOrEqualTo(0)) {
      throw new Error('Slippage protection: quote has no usable counter-amount');
    }
    if (params.minDestinationAmount && estimate.minimumReceived) {
      if (new BigNumber(estimate.minimumReceived).isLessThan(params.minDestinationAmount)) {
        throw new Error(`Slippage protection: minimum received ${estimate.minimumReceived} is below required ${params.minDestinationAmount}`);
      }
    }
    if (params.maxSendAmount && estimate.maximumCost) {
      if (new BigNumber(estimate.maximumCost).isGreaterThan(params.maxSendAmount)) {
        throw new Error(`Slippage protection: maximum cost ${estimate.maximumCost} exceeds limit ${params.maxSendAmount}`);
      }
    }
    if (params.priceLimit && new BigNumber(estimate.price).isLessThan(params.priceLimit)) {
      throw new Error(`Price limit not met: ${estimate.price} < ${params.priceLimit}`);
    }
  }

  private recordSwapAnalytics(
    result: SwapResult,
    success: boolean,
    txHash?: string
  ): void {
    const pathHash = result.path
      .map((a) => {
        const asset = a as Asset;
        return asset.isNative?.() ? 'native' : `${asset.getCode?.() ?? ''}-${asset.getIssuer?.() ?? ''}`;
      })
      .join('|');
    const sourceAsset = result.path[0] as Asset;
    const destAsset = result.path[result.path.length - 1] as Asset;
    this.swapHistory.push({
      timestamp: new Date(),
      pathHash,
      pairKey: this.getPairKey(sourceAsset, destAsset),
      pathDepth: result.path.length,
      inputAmount: result.inputAmount,
      outputAmount: result.outputAmount,
      executedPrice: result.price,
      priceImpact: result.priceImpact,
      success,
      transactionHash: txHash,
    });
    if (this.swapHistory.length > this.maxHistorySize) {
      this.swapHistory = this.swapHistory.slice(-this.maxHistorySize);
    }
  }

  private getPairKey(source: Asset, dest: Asset): string {
    return `${this.assetToString(source)}->${this.assetToString(dest)}`;
  }

  private calculateHistoricalVolatility(pairKey: string): BigNumber {
    const prices = this.swapHistory
      .filter((record) => record.success && record.pairKey === pairKey)
      .slice(-this.volatilityLookback)
      .map((record) => new BigNumber(record.executedPrice))
      .filter((price) => price.isFinite() && price.isGreaterThan(0));

    if (prices.length < 2) return new BigNumber(0);

    const returns: BigNumber[] = [];
    for (let i = 1; i < prices.length; i++) {
      const previous = prices[i - 1];
      const current = prices[i];
      returns.push(current.minus(previous).dividedBy(previous));
    }

    if (returns.length === 0) return new BigNumber(0);

    const mean = returns.reduce((sum, value) => sum.plus(value), new BigNumber(0)).dividedBy(returns.length);
    const variance = returns
      .reduce((sum, value) => sum.plus(value.minus(mean).pow(2)), new BigNumber(0))
      .dividedBy(returns.length);

    return variance.sqrt();
  }

  private calculateHistoricalPriceImpact(pairKey: string, currentPrice: string): string {
    const prices = this.swapHistory
      .filter((record) => record.success && record.pairKey === pairKey)
      .slice(-this.volatilityLookback)
      .map((record) => new BigNumber(record.executedPrice))
      .filter((price) => price.isFinite() && price.isGreaterThan(0));

    if (prices.length === 0) return '0';

    const baseline = BigNumber.maximum(...prices);
    if (baseline.isZero()) return '0';

    return baseline
      .minus(currentPrice)
      .dividedBy(baseline)
      .times(100)
      .absoluteValue()
      .toFixed(2);
  }

  private invalidatePairCacheIfLargeSwap(params: SwapParams, result: SwapResult): void {
    const notional = BigNumber.maximum(
      new BigNumber(result.inputAmount),
      new BigNumber(result.outputAmount)
    );

    if (notional.isLessThan(this.largeSwapAmountThreshold)) return;

    const sourceAsset = this.assetToString(params.sendAsset);
    const destAsset = this.assetToString(params.destAsset);
    const pairFragment = `:${sourceAsset}:${destAsset}:`;
    for (const key of this.pathCache.keys()) {
      if (key.includes(pairFragment)) {
        this.pathCache.delete(key);
      }
    }
  }
}
