/**
 * @fileoverview Helper functions for liquidity pool operations
 * @description Utility functions for common liquidity pool patterns
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-22
 */

import BigNumber from 'bignumber.js';
import { Asset } from '@stellar/stellar-sdk';
import { LiquidityPool } from './types.js';
import { calculateMinimumAmounts, calculatePriceBounds } from './calculations.js';

/**
 * Calculates optimal deposit amounts maintaining pool ratio
 * @param maxAmountA - Maximum amount of asset A user wants to deposit
 * @param maxAmountB - Maximum amount of asset B user wants to deposit
 * @param pool - Current pool state
 * @param slippage - Slippage tolerance (default: 0.01 for 1%)
 * @returns Optimal deposit amounts
 */
export function calculateOptimalDeposit(
  maxAmountA: string,
  maxAmountB: string,
  pool: LiquidityPool,
  slippage: string = '0.01'
): { amountA: string; amountB: string; minAmountA: string; minAmountB: string } {
  const maxA = new BigNumber(maxAmountA);
  const maxB = new BigNumber(maxAmountB);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);

  // Calculate pool ratio
  const poolRatio = reserveB.dividedBy(reserveA);

  // Calculate how much B is needed for maxA
  const neededB = maxA.multipliedBy(poolRatio);

  // Calculate how much A is needed for maxB
  const neededA = maxB.dividedBy(poolRatio);

  let optimalA: string;
  let optimalB: string;

  // Use the constraining amount
  if (neededB.isLessThanOrEqualTo(maxB)) {
    // A is the limiting factor
    optimalA = maxA.toFixed(7);
    optimalB = neededB.toFixed(7);
  } else {
    // B is the limiting factor
    optimalA = neededA.toFixed(7);
    optimalB = maxB.toFixed(7);
  }

  // Calculate minimum amounts with slippage protection
  const { minAmountA, minAmountB } = calculateMinimumAmounts(
    optimalA,
    optimalB,
    slippage
  );

  return {
    amountA: optimalA,
    amountB: optimalB,
    minAmountA,
    minAmountB,
  };
}

/**
 * Formats pool assets as a readable string
 * @param pool - Liquidity pool
 * @returns Formatted string "ASSET_A/ASSET_B"
 */
export function formatPoolAssets(pool: LiquidityPool): string {
  const assetACode =
    pool.assetA.isNative() ? 'XLM' : pool.assetA.getCode();
  const assetBCode =
    pool.assetB.isNative() ? 'XLM' : pool.assetB.getCode();

  return `${assetACode}/${assetBCode}`;
}

/**
 * Calculates the value of user's shares in the pool
 * @param shares - User's share amount
 * @param pool - Pool state
 * @returns Value in terms of each asset
 */
export function calculateShareValue(
  shares: string,
  pool: LiquidityPool
): { valueA: string; valueB: string } {
  const userShares = new BigNumber(shares);
  const totalShares = new BigNumber(pool.totalShares);

  if (totalShares.isZero()) {
    return { valueA: '0', valueB: '0' };
  }

  const shareRatio = userShares.dividedBy(totalShares);

  const valueA = shareRatio.multipliedBy(pool.reserveA).toFixed(7);
  const valueB = shareRatio.multipliedBy(pool.reserveB).toFixed(7);

  return { valueA, valueB };
}

/**
 * Checks if a deposit would significantly impact pool price
 * @param amountA - Amount of asset A to deposit
 * @param amountB - Amount of asset B to deposit
 * @param pool - Current pool state
 * @param threshold - Price impact threshold (default: 0.01 for 1%)
 * @returns True if price impact exceeds threshold
 */
export function wouldImpactPrice(
  amountA: string,
  amountB: string,
  pool: LiquidityPool,
  threshold: string = '0.01'
): boolean {
  const depositA = new BigNumber(amountA);
  const depositB = new BigNumber(amountB);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);

  // Calculate current ratio
  const currentRatio = reserveB.dividedBy(reserveA);

  // Calculate new ratio after deposit
  const newReserveA = reserveA.plus(depositA);
  const newReserveB = reserveB.plus(depositB);
  const newRatio = newReserveB.dividedBy(newReserveA);

  // Calculate price change
  const priceChange = newRatio.minus(currentRatio).abs().dividedBy(currentRatio);

  return priceChange.isGreaterThan(threshold);
}

/**
 * Calculates the break-even price for a liquidity position
 * Useful for understanding when to exit a position
 * @param initialAmountA - Initial deposit of asset A
 * @param initialAmountB - Initial deposit of asset B
 * @param currentReserveA - Current pool reserve A
 * @param currentReserveB - Current pool reserve B
 * @returns Break-even price ratio
 */
export function calculateBreakEvenPrice(
  initialAmountA: string,
  initialAmountB: string,
  currentReserveA: string,
  currentReserveB: string
): string {
  const initA = new BigNumber(initialAmountA);
  const initB = new BigNumber(initialAmountB);

  // Initial average price
  const initialPrice = initB.dividedBy(initA);

  return initialPrice.toFixed(7);
}

/**
 * Estimates impermanent loss for a liquidity position
 * @param initialPrice - Price when position was opened
 * @param currentPrice - Current price
 * @returns Impermanent loss as percentage
 */
export function calculateImpermanentLoss(
  initialPrice: string,
  currentPrice: string
): string {
  const p0 = new BigNumber(initialPrice);
  const p1 = new BigNumber(currentPrice);

  // IL formula: 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
  const priceRatio = p1.dividedBy(p0);
  const sqrtRatio = priceRatio.sqrt();

  const il = new BigNumber(2)
    .multipliedBy(sqrtRatio)
    .dividedBy(new BigNumber(1).plus(priceRatio))
    .minus(1)
    .abs();

  return il.multipliedBy(100).toFixed(2);
}

/**
 * Checks if pool has sufficient liquidity for an operation
 * @param requiredAmountA - Required amount of asset A
 * @param requiredAmountB - Required amount of asset B
 * @param pool - Pool state
 * @param safetyMargin - Safety margin as percentage (default: 0.01 for 1%)
 * @returns True if pool has sufficient liquidity
 */
export function hasSufficientLiquidity(
  requiredAmountA: string,
  requiredAmountB: string,
  pool: LiquidityPool,
  safetyMargin: string = '0.01'
): boolean {
  const reqA = new BigNumber(requiredAmountA);
  const reqB = new BigNumber(requiredAmountB);
  const resA = new BigNumber(pool.reserveA);
  const resB = new BigNumber(pool.reserveB);

  // Apply safety margin
  const margin = new BigNumber(1).minus(safetyMargin);
  const availableA = resA.multipliedBy(margin);
  const availableB = resB.multipliedBy(margin);

  return reqA.isLessThanOrEqualTo(availableA) && reqB.isLessThanOrEqualTo(availableB);
}

/**
 * Calculates annual percentage rate (APR) from fees
 * @param dailyFees - Daily fees earned
 * @param totalLiquidity - Total liquidity in pool
 * @returns APR as percentage
 */
export function calculateAPRFromFees(
  dailyFees: string,
  totalLiquidity: string
): string {
  const fees = new BigNumber(dailyFees);
  const liquidity = new BigNumber(totalLiquidity);

  if (liquidity.isZero()) {
    return '0.00';
  }

  // APR = (dailyFees / totalLiquidity) * 365 * 100
  const apr = fees.dividedBy(liquidity).multipliedBy(365).multipliedBy(100);

  return apr.toFixed(2);
}

/**
 * Formats an amount to Stellar's 7 decimal precision
 * @param amount - Amount to format
 * @returns Formatted amount
 */
export function toStellarPrecision(amount: string | number): string {
  return new BigNumber(amount).toFixed(7, BigNumber.ROUND_DOWN);
}

/**
 * Checks if two assets match (useful for finding pools)
 * @param asset1 - First asset
 * @param asset2 - Second asset
 * @returns True if assets are the same
 */
export function assetsEqual(asset1: Asset, asset2: Asset): boolean {
  if (asset1.isNative() && asset2.isNative()) {
    return true;
  }

  if (asset1.isNative() || asset2.isNative()) {
    return false;
  }

  return (
    asset1.getCode() === asset2.getCode() &&
    asset1.getIssuer() === asset2.getIssuer()
  );
}

/**
 * Sorts two assets lexicographically (required for pool ID generation)
 * @param assetA - First asset
 * @param assetB - Second asset
 * @returns Sorted assets [first, second]
 */
export function sortAssets(assetA: Asset, assetB: Asset): [Asset, Asset] {
  const codeA = assetA.isNative() ? 'XLM' : assetA.getCode();
  const codeB = assetB.isNative() ? 'XLM' : assetB.getCode();

  // Sort by code first
  if (codeA < codeB) {
    return [assetA, assetB];
  } else if (codeA > codeB) {
    return [assetB, assetA];
  }

  // If codes are the same, sort by issuer
  if (!assetA.isNative() && !assetB.isNative()) {
    const issuerA = assetA.getIssuer();
    const issuerB = assetB.getIssuer();

    return issuerA < issuerB ? [assetA, assetB] : [assetB, assetA];
  }

  return [assetA, assetB];
}
