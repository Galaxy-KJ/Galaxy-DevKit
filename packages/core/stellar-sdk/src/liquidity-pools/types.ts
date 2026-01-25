/**
 * @fileoverview Type definitions for liquidity pools
 * @description Contains all interfaces and types related to liquidity pool functionality
 */

import { Asset } from '@stellar/stellar-sdk';

/**
 * Liquidity pool information
 * @interface LiquidityPool
 */
export interface LiquidityPool {
  id: string;
  assetA: Asset;
  assetB: Asset;
  reserveA: string;
  reserveB: string;
  totalShares: string;
  totalTrustlines: number;
  fee: number; // basis points (e.g., 30 = 0.3%)
}

/**
 * Deposit liquidity parameters
 * @interface LiquidityPoolDeposit
 */
export interface LiquidityPoolDeposit {
  poolId: string;
  maxAmountA: string;
  maxAmountB: string;
  minPrice?: string;
  maxPrice?: string;
  slippageTolerance?: string; // e.g., "0.01" for 1%
  memo?: string;
  fee?: number;
}

/**
 * Withdraw liquidity parameters
 * @interface LiquidityPoolWithdraw
 */
export interface LiquidityPoolWithdraw {
  poolId: string;
  shares: string;
  minAmountA?: string;
  minAmountB?: string;
  slippageTolerance?: string; // e.g., "0.01" for 1%
  memo?: string;
  fee?: number;
}

/**
 * Query liquidity pools parameters
 * @interface QueryPoolsParams
 */
export interface QueryPoolsParams {
  assets?: Asset[];
  limit?: number;
  cursor?: string;
}

/**
 * Liquidity pool operation result
 * @interface LiquidityPoolResult
 */
export interface LiquidityPoolResult {
  poolId: string;
  hash: string;
  status: string;
  ledger: string;
  createdAt: Date;
}

/**
 * Pool analytics information
 * Note: volume24h, fees24h, and apy require historical data from external sources
 * @interface PoolAnalytics
 */
export interface PoolAnalytics {
  tvl: string; // Total Value Locked in pool reserves (asset units, not USD)
  sharePrice: string; // Price per share in terms of asset A
  volume24h?: string; // 24-hour volume (requires historical data)
  fees24h?: string; // 24-hour fees earned (requires historical data)
  apy?: string; // Annual percentage yield (requires historical data)
}

/**
 * Price impact information
 * @interface PriceImpact
 */
export interface PriceImpact {
  inputAmount: string;
  outputAmount: string;
  priceImpact: string; // As percentage
  minimumReceived: string; // After slippage
  effectivePrice: string;
  isHighImpact: boolean; // true if > 5%
}

/**
 * Deposit estimation result
 * @interface DepositEstimate
 */
export interface DepositEstimate {
  shares: string;
  actualAmountA: string;
  actualAmountB: string;
  sharePrice: string;
  priceImpact: string;
  poolShare: string; // Percentage of pool
}

/**
 * Withdraw estimation result
 * @interface WithdrawEstimate
 */
export interface WithdrawEstimate {
  amountA: string;
  amountB: string;
  sharePrice: string;
  priceImpact: string;
}

/**
 * Pool share information
 * @interface PoolShare
 */
export interface PoolShare {
  poolId: string;
  balance: string;
  percentage: string; // Percentage of total pool
  valueUSD?: string;
}

/**
 * Trade information for analytics
 * @interface PoolTrade
 */
export interface PoolTrade {
  timestamp: Date;
  type: 'deposit' | 'withdraw' | 'swap';
  amountA?: string;
  amountB?: string;
  shares?: string;
  account: string;
}
