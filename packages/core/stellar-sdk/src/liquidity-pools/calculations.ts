/**
 * @fileoverview Liquidity pool calculation functions
 * @description Mathematical formulas for constant product AMM (x * y = k)
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-22
 */

import BigNumber from 'bignumber.js';
import { LiquidityPool, PriceImpact, DepositEstimate, WithdrawEstimate } from './types';

// Configure BigNumber for Stellar's 7 decimal places precision
BigNumber.config({ DECIMAL_PLACES: 7, ROUNDING_MODE: BigNumber.ROUND_DOWN });

/**
 * Calculates constant product (k = x * y)
 * Used to verify pool invariant is maintained
 * @param reserveA - Reserve amount of asset A
 * @param reserveB - Reserve amount of asset B
 * @returns Constant product k
 */
export function calculateConstantProduct(reserveA: string, reserveB: string): string {
  const a = new BigNumber(reserveA);
  const b = new BigNumber(reserveB);
  return a.multipliedBy(b).toFixed(14); // Higher precision for k
}

/**
 * Calculates spot price (P = reserveB / reserveA)
 * This is the current exchange rate between assets
 * @param reserveA - Reserve amount of asset A
 * @param reserveB - Reserve amount of asset B
 * @returns Spot price
 */
export function calculateSpotPrice(reserveA: string, reserveB: string): string {
  const a = new BigNumber(reserveA);
  const b = new BigNumber(reserveB);

  if (a.isZero()) {
    throw new Error('Reserve A cannot be zero');
  }

  return b.dividedBy(a).toFixed(7);
}

/**
 * Calculates shares received for a deposit
 * For first deposit: shares = sqrt(amountA * amountB)
 * For subsequent: shares = min(amountA/reserveA, amountB/reserveB) * totalShares
 *
 * @param amountA - Amount of asset A to deposit
 * @param amountB - Amount of asset B to deposit
 * @param pool - Current pool state
 * @returns Deposit calculation result
 */
export function calculateDepositShares(
  amountA: string,
  amountB: string,
  pool: LiquidityPool
): { shares: string; actualAmountA: string; actualAmountB: string } {
  const depositA = new BigNumber(amountA);
  const depositB = new BigNumber(amountB);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);
  const totalShares = new BigNumber(pool.totalShares);

  // Check if this is the first deposit
  const isFirstDeposit = totalShares.isZero();

  if (isFirstDeposit) {
    // First deposit: shares = sqrt(amountA * amountB)
    // Minimum first liquidity is locked permanently to prevent inflation attacks
    const product = depositA.multipliedBy(depositB);
    const shares = product.sqrt().toFixed(7, BigNumber.ROUND_DOWN);

    return {
      shares,
      actualAmountA: amountA,
      actualAmountB: amountB,
    };
  }

  // Subsequent deposits: proportional to existing reserves
  // We use the minimum ratio to prevent unbalanced deposits that would move price
  if (reserveA.isZero() || reserveB.isZero()) {
    throw new Error('Pool reserves cannot be zero for subsequent deposits');
  }

  const ratioA = depositA.dividedBy(reserveA);
  const ratioB = depositB.dividedBy(reserveB);
  const minRatio = BigNumber.min(ratioA, ratioB);

  // Shares based on minimum ratio (prevents price manipulation)
  // Use more precision during calculation, then round down
  const sharesCalc = minRatio.multipliedBy(totalShares);
  const shares = sharesCalc.toFixed(7, BigNumber.ROUND_DOWN);

  // Actual amounts used (may be less than max if ratios differ)
  // Calculate based on shares to ensure consistency, then round up for safety
  const sharesToTotalRatio = new BigNumber(shares).dividedBy(totalShares);
  const actualAmountA = sharesToTotalRatio.multipliedBy(reserveA).plus('0.0000001').toFixed(7, BigNumber.ROUND_DOWN);
  const actualAmountB = sharesToTotalRatio.multipliedBy(reserveB).plus('0.0000001').toFixed(7, BigNumber.ROUND_DOWN);

  return {
    shares,
    actualAmountA,
    actualAmountB,
  };
}

/**
 * Calculates amounts received when withdrawing shares
 * Formula: (amountA, amountB) = (shares/totalShares) * (reserveA, reserveB)
 *
 * @param shares - Amount of shares to withdraw
 * @param pool - Current pool state
 * @returns Withdrawal amounts
 */
export function calculateWithdrawAmounts(
  shares: string,
  pool: LiquidityPool
): { amountA: string; amountB: string } {
  const withdrawShares = new BigNumber(shares);
  const totalShares = new BigNumber(pool.totalShares);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);

  if (totalShares.isZero()) {
    throw new Error('Cannot withdraw from empty pool');
  }

  if (withdrawShares.isGreaterThan(totalShares)) {
    throw new Error('Withdrawal shares exceed total shares');
  }

  // Calculate share ratio
  const shareRatio = withdrawShares.dividedBy(totalShares);

  // Calculate amounts (round DOWN to favor the pool)
  const amountA = shareRatio.multipliedBy(reserveA).toFixed(7, BigNumber.ROUND_DOWN);
  const amountB = shareRatio.multipliedBy(reserveB).toFixed(7, BigNumber.ROUND_DOWN);

  return { amountA, amountB };
}

/**
 * Calculates price impact for a swap
 * Price impact = (spotPrice - effectivePrice) / spotPrice
 *
 * @param inputAmount - Amount being swapped in
 * @param outputAmount - Amount being swapped out
 * @param reserveIn - Reserve of input asset
 * @param reserveOut - Reserve of output asset
 * @returns Price impact information
 */
export function calculatePriceImpact(
  inputAmount: string,
  outputAmount: string,
  reserveIn: string,
  reserveOut: string
): PriceImpact {
  const input = new BigNumber(inputAmount);
  const output = new BigNumber(outputAmount);
  const resIn = new BigNumber(reserveIn);
  const resOut = new BigNumber(reserveOut);

  if (resIn.isZero() || input.isZero()) {
    throw new Error('Reserves and input must be greater than zero');
  }

  // Spot price before trade
  const spotPrice = resOut.dividedBy(resIn);

  // Effective price of this trade
  const effectivePrice = output.dividedBy(input);

  // Price impact as percentage
  const impact = spotPrice.minus(effectivePrice).dividedBy(spotPrice).abs();
  const priceImpact = impact.multipliedBy(100).toFixed(2);

  // High impact if > 5%
  const isHighImpact = impact.isGreaterThan(0.05);

  return {
    inputAmount,
    outputAmount,
    priceImpact,
    minimumReceived: output.toFixed(7),
    effectivePrice: effectivePrice.toFixed(7),
    isHighImpact,
  };
}

/**
 * Calculates swap output amount using constant product formula
 * Formula: outputAmount = (inputAfterFee * reserveOut) / (reserveIn + inputAfterFee)
 * Where inputAfterFee = inputAmount * (1 - feeBasisPoints/10000)
 *
 * @param inputAmount - Amount being swapped in
 * @param reserveIn - Reserve of input asset
 * @param reserveOut - Reserve of output asset
 * @param feeBasisPoints - Fee in basis points (default: 30 = 0.3%)
 * @returns Output amount after fee
 */
export function calculateSwapOutput(
  inputAmount: string,
  reserveIn: string,
  reserveOut: string,
  feeBasisPoints: number = 30
): string {
  const input = new BigNumber(inputAmount);
  const resIn = new BigNumber(reserveIn);
  const resOut = new BigNumber(reserveOut);

  if (resIn.isZero() || resOut.isZero()) {
    throw new Error('Reserves must be greater than zero');
  }

  // Calculate fee multiplier (e.g., 30 basis points = 0.997)
  const feeMultiplier = new BigNumber(1).minus(
    new BigNumber(feeBasisPoints).dividedBy(10000)
  );

  // Input after fee
  const inputAfterFee = input.multipliedBy(feeMultiplier);

  // Output = (inputAfterFee * reserveOut) / (reserveIn + inputAfterFee)
  const numerator = inputAfterFee.multipliedBy(resOut);
  const denominator = resIn.plus(inputAfterFee);

  return numerator.dividedBy(denominator).toFixed(7, BigNumber.ROUND_DOWN);
}

/**
 * Estimates deposit operation
 * @param amountA - Desired amount of asset A
 * @param amountB - Desired amount of asset B
 * @param pool - Current pool state
 * @returns Deposit estimation
 */
export function estimateDeposit(
  amountA: string,
  amountB: string,
  pool: LiquidityPool
): DepositEstimate {
  const { shares, actualAmountA, actualAmountB } = calculateDepositShares(
    amountA,
    amountB,
    pool
  );

  const totalShares = new BigNumber(pool.totalShares);
  const newTotalShares = totalShares.plus(shares);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);

  // Check if this is the first deposit (empty pool)
  const isFirstDeposit = totalShares.isZero() || reserveA.isZero() || reserveB.isZero();

  // Calculate share price (value of 1 share)
  const sharePrice = isFirstDeposit
    ? '1.0000000'
    : reserveA.plus(actualAmountA).dividedBy(newTotalShares).toFixed(7);

  // Calculate price impact (change in spot price)
  let priceImpact = '0.00';
  if (!isFirstDeposit) {
    const oldSpotPrice = calculateSpotPrice(pool.reserveA, pool.reserveB);
    const newReserveA = reserveA.plus(actualAmountA).toFixed(7);
    const newReserveB = reserveB.plus(actualAmountB).toFixed(7);
    const newSpotPrice = calculateSpotPrice(newReserveA, newReserveB);

    const priceChange = new BigNumber(newSpotPrice).minus(oldSpotPrice).abs();
    priceImpact = priceChange.dividedBy(oldSpotPrice).multipliedBy(100).toFixed(2);
  }

  // Calculate pool share percentage
  const poolShare = new BigNumber(shares).dividedBy(newTotalShares).multipliedBy(100).toFixed(4);

  return {
    shares,
    actualAmountA,
    actualAmountB,
    sharePrice,
    priceImpact,
    poolShare,
  };
}

/**
 * Estimates withdrawal operation
 * @param shares - Shares to withdraw
 * @param pool - Current pool state
 * @returns Withdrawal estimation
 */
export function estimateWithdraw(
  shares: string,
  pool: LiquidityPool
): WithdrawEstimate {
  const { amountA, amountB } = calculateWithdrawAmounts(shares, pool);

  const totalShares = new BigNumber(pool.totalShares);
  const reserveA = new BigNumber(pool.reserveA);
  const reserveB = new BigNumber(pool.reserveB);

  // Calculate share price
  const sharePrice = reserveA.dividedBy(totalShares).toFixed(7);

  // Check if this withdrawal will empty the pool
  const newReserveA = reserveA.minus(amountA);
  const newReserveB = reserveB.minus(amountB);
  const willEmptyPool = newReserveA.isLessThanOrEqualTo(0) || newReserveB.isLessThanOrEqualTo(0);

  // Calculate price impact (change in spot price)
  let priceImpact = '0.00';
  if (!willEmptyPool) {
    const oldSpotPrice = calculateSpotPrice(pool.reserveA, pool.reserveB);
    const newSpotPrice = calculateSpotPrice(newReserveA.toFixed(7), newReserveB.toFixed(7));

    const priceChange = new BigNumber(newSpotPrice).minus(oldSpotPrice).abs();
    priceImpact = priceChange.dividedBy(oldSpotPrice).multipliedBy(100).toFixed(2);
  }

  return {
    amountA,
    amountB,
    sharePrice,
    priceImpact,
  };
}

/**
 * Calculates minimum amounts with slippage protection
 * @param expectedAmountA - Expected amount of asset A
 * @param expectedAmountB - Expected amount of asset B
 * @param slippage - Slippage tolerance (e.g., "0.01" for 1%)
 * @returns Minimum amounts
 */
export function calculateMinimumAmounts(
  expectedAmountA: string,
  expectedAmountB: string,
  slippage: string
): { minAmountA: string; minAmountB: string } {
  const tolerance = new BigNumber(1).minus(slippage);

  const minAmountA = new BigNumber(expectedAmountA)
    .multipliedBy(tolerance)
    .toFixed(7, BigNumber.ROUND_DOWN);

  const minAmountB = new BigNumber(expectedAmountB)
    .multipliedBy(tolerance)
    .toFixed(7, BigNumber.ROUND_DOWN);

  return { minAmountA, minAmountB };
}

/**
 * Calculates price bounds for slippage protection
 * @param expectedPrice - Expected price
 * @param slippage - Slippage tolerance (e.g., "0.01" for 1%)
 * @returns Min and max price bounds with spot price and tolerance percentage
 */
export function calculatePriceBounds(
  expectedPrice: string,
  slippage: string
): { minPrice: string; maxPrice: string; spotPrice: string; tolerancePercent: string } {
  const price = new BigNumber(expectedPrice);
  const tolerance = new BigNumber(slippage);

  const minPrice = price
    .multipliedBy(new BigNumber(1).minus(tolerance))
    .toFixed(7, BigNumber.ROUND_DOWN);

  const maxPrice = price
    .multipliedBy(new BigNumber(1).plus(tolerance))
    .toFixed(7, BigNumber.ROUND_UP);

  const tolerancePercent = tolerance.multipliedBy(100).toFixed(2);

  return {
    minPrice,
    maxPrice,
    spotPrice: expectedPrice,
    tolerancePercent
  };
}
