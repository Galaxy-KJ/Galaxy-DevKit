/**
 * @fileoverview Type definitions for path payments and swap operations
 * @description Interfaces for path finding, swap execution, and analytics
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Asset } from '@stellar/stellar-sdk';

/**
 * Payment path from source to destination asset
 * Maps to Horizon path payment response
 */
export interface PaymentPath {
  source_asset: Asset;
  destination_asset: Asset;
  path: Asset[];
  source_amount: string;
  destination_amount: string;
  price: string;
  priceImpact: string; // percentage
  /** Path depth (number of hops) */
  pathDepth?: number;
  /** Liquidity depth indicator */
  liquidityDepth?: 'high' | 'medium' | 'low';
}

/**
 * Swap type: strict send (fixed send amount) or strict receive (fixed receive amount)
 */
export type SwapType = 'strict_send' | 'strict_receive';

/**
 * Parameters for executing a swap
 */
export interface SwapParams {
  sendAsset: Asset;
  destAsset: Asset;
  amount: string;
  type: SwapType;
  /** Maximum slippage as percentage (e.g., 1 for 1%) */
  maxSlippage?: number;
  /** Custom path (optional; if not provided, best path is used) */
  customPath?: Asset[];
  /** Minimum destination amount (for strict send) */
  minDestinationAmount?: string;
  /** Maximum source amount (for strict receive) */
  maxSendAmount?: string;
  /** Price limit (optional validation) */
  priceLimit?: string;
  /** Destination account (defaults to source for self-swap) */
  destinationAccount?: string;
}

/**
 * Result of a swap execution
 */
export interface SwapResult {
  path: Asset[];
  inputAmount: string;
  outputAmount: string;
  price: string;
  priceImpact: string;
  transactionHash: string;
  /** Whether high impact was warned */
  highImpactWarning?: boolean;
  /** Slippage applied */
  slippageApplied?: string;
}

/**
 * Estimate result for a swap (no execution)
 */
export interface SwapEstimate {
  path: Asset[];
  inputAmount: string;
  outputAmount: string;
  price: string;
  priceImpact: string;
  minimumReceived?: string;
  maximumCost?: string;
  highImpact: boolean;
  /** Suggested max slippage for this path */
  suggestedMaxSlippage?: number;
}

/**
 * Path finding request (strict send: fixed source amount)
 */
export interface StrictSendPathParams {
  sourceAsset: Asset;
  sourceAmount: string;
  destinationAsset: Asset;
  destinationAccount?: string;
  limit?: number;
}

/**
 * Path finding request (strict receive: fixed destination amount)
 */
export interface StrictReceivePathParams {
  sourceAsset: Asset;
  destinationAsset: Asset;
  destinationAmount: string;
  sourceAccount?: string;
  limit?: number;
}

/**
 * Slippage protection settings
 */
export interface SlippageProtection {
  /** Minimum destination amount (strict send) */
  minDestinationAmount?: string;
  /** Maximum send amount (strict receive) */
  maxSendAmount?: string;
  /** Max slippage percentage */
  maxSlippagePercent: number;
  /** Price limit (optional) */
  priceLimit?: string;
}

/**
 * Price impact warning threshold (percentage)
 */
export const HIGH_PRICE_IMPACT_THRESHOLD = 5;

/**
 * Swap analytics record (historical)
 */
export interface SwapAnalyticsRecord {
  timestamp: Date;
  pathHash: string;
  pathDepth: number;
  inputAmount: string;
  outputAmount: string;
  priceImpact: string;
  success: boolean;
  transactionHash?: string;
}

/**
 * Path success rate and average price (analytics)
 */
export interface PathAnalytics {
  pathHash: string;
  path: string[];
  successCount: number;
  failureCount: number;
  successRate: number;
  averagePrice: string;
  averagePriceImpact: string;
  lastUsed: Date;
}

/**
 * Path cache entry with TTL
 */
export interface PathCacheEntry {
  paths: PaymentPath[];
  fetchedAt: number;
  ttlMs: number;
}
