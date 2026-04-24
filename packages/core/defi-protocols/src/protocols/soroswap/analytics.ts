/**
 * @fileoverview Soroswap pool analytics helpers
 * @description Pure helpers for deriving TVL, fee revenue, APR, and LP impermanent loss
 * @author ryzen-xp
 * @version 1.0.0
 * @since 2026-04-23
 */

import BigNumber from 'bignumber.js';

import { Asset } from '../../types/defi-types.js';
import { PoolAnalytics } from '../../types/protocol-interface.js';
import { SOROSWAP_DEFAULT_FEE } from './soroswap-config.js';

export type NumericLike = bigint | number | string;

export interface SoroswapLpPositionInput {
  /** Raw LP token amount owned by the user, expressed in stroops-style integer units */
  lpTokenAmount: NumericLike;
  /** Optional reference price ratio at deposit time: token1 per token0 */
  initialPriceRatio?: number;
}

export interface SoroswapLpPositionAnalytics {
  /** Raw LP token amount */
  lpTokenAmount: bigint;
  /** Share of the pool represented by lpTokenAmount */
  poolShare: number;
  /** Current underlying amount of token0 represented by the LP position */
  token0Underlying: number;
  /** Current underlying amount of token1 represented by the LP position */
  token1Underlying: number;
  /** Current USD value of the LP position */
  positionValueUsd: number;
  /** Estimated USD value had the user simply held the assets instead */
  holdValueUsd: number;
  /** Estimated impermanent loss as a positive percentage */
  impermanentLossPct: number;
  /** Estimated impermanent loss denominated in USD */
  impermanentLossUsd: number;
  /** Estimated share of the pool's 24h fee revenue */
  estimatedFees24hUsd: number;
  /** Annualised fee APR for the LP position */
  projectedFeeApr: number;
}

export interface SoroswapPoolAnalyticsOptions {
  /** USD price for token0 */
  token0PriceUsd?: number;
  /** USD price for token1 */
  token1PriceUsd?: number;
  /** Observed 24h trading volume in USD */
  volume24hUsd?: number;
  /** Observed 7d trading volume in USD */
  volume7dUsd?: number;
  /** Observed 30d trading volume in USD */
  volume30dUsd?: number;
  /** Fee rate as a decimal, e.g. 0.003 */
  feeRate?: number;
  /** Decimals for token0; Stellar assets default to 7 */
  token0Decimals?: number;
  /** Decimals for token1; Stellar assets default to 7 */
  token1Decimals?: number;
  /** Optional LP position input to estimate position analytics */
  lpPosition?: SoroswapLpPositionInput;
  /** Optional last updated timestamp override */
  lastUpdated?: number;
}

export interface SoroswapPoolAnalytics extends PoolAnalytics {
  /** Raw LP token total supply */
  totalSupply: bigint;
  /** Reserve0 converted to display units */
  reserve0Normalized: number;
  /** Reserve1 converted to display units */
  reserve1Normalized: number;
  /** Swap fee rate applied to pool volume */
  feeRate: number;
  /** Estimated 24h fee revenue in USD */
  fees24hUsd: number;
  /** Estimated 7d trading volume in USD */
  volume7dUsd: number;
  /** Estimated 30d trading volume in USD */
  volume30dUsd: number;
  /** Optional LP position analytics */
  lpPosition?: SoroswapLpPositionAnalytics;
}

export interface SoroswapPoolAnalyticsInput {
  poolAddress: string;
  token0: Asset;
  token1: Asset;
  reserve0: NumericLike;
  reserve1: NumericLike;
  totalSupply?: NumericLike;
  options?: SoroswapPoolAnalyticsOptions;
}

const STELLAR_ASSET_DECIMALS = 7;

function toBigInt(value: NumericLike | undefined): bigint {
  if (value === undefined) {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return 0n;
    }
    return BigInt(Math.trunc(value));
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0n;
  }

  try {
    return BigInt(trimmed);
  } catch {
    return BigInt(new BigNumber(trimmed).integerValue(BigNumber.ROUND_DOWN).toFixed(0));
  }
}

function sanitizeNumber(value: number | undefined, fallback = 0): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function divideSafely(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

export function normalizeSoroswapAmount(
  value: NumericLike,
  decimals = STELLAR_ASSET_DECIMALS
): number {
  const base = new BigNumber(10).pow(Math.max(0, decimals));
  const normalized = new BigNumber(toBigInt(value).toString()).dividedBy(base);
  return normalized.isFinite() ? normalized.toNumber() : 0;
}

export function calculateSpotPrice(baseReserve: NumericLike, quoteReserve: NumericLike): number {
  const base = normalizeSoroswapAmount(baseReserve);
  const quote = normalizeSoroswapAmount(quoteReserve);
  return divideSafely(quote, base);
}

export function calculateTvlUsd(params: {
  reserve0: NumericLike;
  reserve1: NumericLike;
  token0PriceUsd?: number;
  token1PriceUsd?: number;
  token0Decimals?: number;
  token1Decimals?: number;
}): number {
  const reserve0 = normalizeSoroswapAmount(
    params.reserve0,
    params.token0Decimals ?? STELLAR_ASSET_DECIMALS
  );
  const reserve1 = normalizeSoroswapAmount(
    params.reserve1,
    params.token1Decimals ?? STELLAR_ASSET_DECIMALS
  );
  const token0Value = reserve0 * clampNonNegative(sanitizeNumber(params.token0PriceUsd));
  const token1Value = reserve1 * clampNonNegative(sanitizeNumber(params.token1PriceUsd));
  const tvlUsd = token0Value + token1Value;
  return Number.isFinite(tvlUsd) ? tvlUsd : 0;
}

export function estimateFeeRevenueUsd(
  volumeUsd: number,
  feeRate = Number(SOROSWAP_DEFAULT_FEE)
): number {
  return clampNonNegative(sanitizeNumber(volumeUsd)) * clampNonNegative(sanitizeNumber(feeRate));
}

export function calculateFeeApr(params: {
  tvlUsd: number;
  volume24hUsd: number;
  feeRate?: number;
}): number {
  const tvlUsd = clampNonNegative(sanitizeNumber(params.tvlUsd));
  if (tvlUsd === 0) {
    return 0;
  }

  const fees24hUsd = estimateFeeRevenueUsd(
    params.volume24hUsd,
    params.feeRate ?? Number(SOROSWAP_DEFAULT_FEE)
  );

  return (fees24hUsd * 365) / tvlUsd;
}

export function estimateImpermanentLossPct(
  currentPriceRatio: number,
  initialPriceRatio = 1
): number {
  const currentRatio = clampNonNegative(sanitizeNumber(currentPriceRatio));
  const depositRatio = clampNonNegative(sanitizeNumber(initialPriceRatio));

  if (currentRatio === 0 || depositRatio === 0) {
    return 0;
  }

  const relativeChange = currentRatio / depositRatio;
  const lpRelativeValue = (2 * Math.sqrt(relativeChange)) / (1 + relativeChange);
  return Math.max(0, (1 - lpRelativeValue) * 100);
}

export function calculateLpPositionAnalytics(params: {
  reserve0: NumericLike;
  reserve1: NumericLike;
  totalSupply: NumericLike;
  token0PriceUsd?: number;
  token1PriceUsd?: number;
  volume24hUsd?: number;
  feeRate?: number;
  lpPosition: SoroswapLpPositionInput;
  token0Decimals?: number;
  token1Decimals?: number;
}): SoroswapLpPositionAnalytics {
  const totalSupply = toBigInt(params.totalSupply);
  const lpTokenAmount = toBigInt(params.lpPosition.lpTokenAmount);
  const poolShare = divideSafely(Number(lpTokenAmount), Number(totalSupply));

  const reserve0Normalized = normalizeSoroswapAmount(
    params.reserve0,
    params.token0Decimals ?? STELLAR_ASSET_DECIMALS
  );
  const reserve1Normalized = normalizeSoroswapAmount(
    params.reserve1,
    params.token1Decimals ?? STELLAR_ASSET_DECIMALS
  );
  const token0Underlying = reserve0Normalized * poolShare;
  const token1Underlying = reserve1Normalized * poolShare;
  const token0PriceUsd = clampNonNegative(sanitizeNumber(params.token0PriceUsd));
  const token1PriceUsd = clampNonNegative(sanitizeNumber(params.token1PriceUsd));
  const positionValueUsd =
    token0Underlying * token0PriceUsd + token1Underlying * token1PriceUsd;
  const currentPriceRatio = divideSafely(reserve1Normalized, reserve0Normalized);
  const impermanentLossPct = estimateImpermanentLossPct(
    currentPriceRatio,
    params.lpPosition.initialPriceRatio
  );
  const holdValueUsd =
    impermanentLossPct >= 100 ? 0 : divideSafely(positionValueUsd, 1 - impermanentLossPct / 100);
  const fees24hUsd = estimateFeeRevenueUsd(
    sanitizeNumber(params.volume24hUsd),
    params.feeRate ?? Number(SOROSWAP_DEFAULT_FEE)
  );
  const estimatedFees24hUsd = fees24hUsd * poolShare;
  const projectedFeeApr = calculateFeeApr({
    tvlUsd: calculateTvlUsd({
      reserve0: params.reserve0,
      reserve1: params.reserve1,
      token0PriceUsd,
      token1PriceUsd,
      token0Decimals: params.token0Decimals,
      token1Decimals: params.token1Decimals,
    }),
    volume24hUsd: sanitizeNumber(params.volume24hUsd),
    feeRate: params.feeRate,
  });

  return {
    lpTokenAmount,
    poolShare: Number.isFinite(poolShare) ? poolShare : 0,
    token0Underlying,
    token1Underlying,
    positionValueUsd: Number.isFinite(positionValueUsd) ? positionValueUsd : 0,
    holdValueUsd: Number.isFinite(holdValueUsd) ? holdValueUsd : 0,
    impermanentLossPct,
    impermanentLossUsd: Math.max(0, holdValueUsd - positionValueUsd),
    estimatedFees24hUsd,
    projectedFeeApr,
  };
}

export function calculateSoroswapPoolAnalytics(
  input: SoroswapPoolAnalyticsInput
): SoroswapPoolAnalytics {
  const options = input.options ?? {};
  const reserve0 = toBigInt(input.reserve0);
  const reserve1 = toBigInt(input.reserve1);
  const totalSupply = toBigInt(input.totalSupply);
  const token0Decimals = options.token0Decimals ?? STELLAR_ASSET_DECIMALS;
  const token1Decimals = options.token1Decimals ?? STELLAR_ASSET_DECIMALS;
  const feeRate = clampNonNegative(
    sanitizeNumber(options.feeRate, Number(SOROSWAP_DEFAULT_FEE))
  );
  const volume24hUsd = clampNonNegative(sanitizeNumber(options.volume24hUsd));
  const volume7dUsd = clampNonNegative(sanitizeNumber(options.volume7dUsd));
  const volume30dUsd = clampNonNegative(sanitizeNumber(options.volume30dUsd));
  const reserve0Normalized = normalizeSoroswapAmount(reserve0, token0Decimals);
  const reserve1Normalized = normalizeSoroswapAmount(reserve1, token1Decimals);
  const tvlUsd = calculateTvlUsd({
    reserve0,
    reserve1,
    token0PriceUsd: options.token0PriceUsd,
    token1PriceUsd: options.token1PriceUsd,
    token0Decimals,
    token1Decimals,
  });
  const fees24hUsd = estimateFeeRevenueUsd(volume24hUsd, feeRate);
  const feeApr = calculateFeeApr({ tvlUsd, volume24hUsd, feeRate });

  const analytics: SoroswapPoolAnalytics = {
    poolAddress: input.poolAddress,
    token0: input.token0,
    token1: input.token1,
    reserve0,
    reserve1,
    totalSupply,
    reserve0Normalized,
    reserve1Normalized,
    tvlUsd,
    volume24hUsd,
    feeRate,
    fees24hUsd,
    volume7dUsd,
    volume30dUsd,
    feeApr,
    priceToken0InToken1: divideSafely(reserve1Normalized, reserve0Normalized),
    priceToken1InToken0: divideSafely(reserve0Normalized, reserve1Normalized),
    lastUpdated: options.lastUpdated ?? Date.now(),
  };

  if (options.lpPosition) {
    analytics.lpPosition = calculateLpPositionAnalytics({
      reserve0,
      reserve1,
      totalSupply,
      token0PriceUsd: options.token0PriceUsd,
      token1PriceUsd: options.token1PriceUsd,
      volume24hUsd,
      feeRate,
      lpPosition: options.lpPosition,
      token0Decimals,
      token1Decimals,
    });
  }

  return analytics;
}
