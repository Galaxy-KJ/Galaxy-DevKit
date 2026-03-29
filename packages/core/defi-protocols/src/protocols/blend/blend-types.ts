/**
 * @fileoverview Blend Protocol specific types and interfaces
 * @description Type definitions for Blend lending protocol on Stellar
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { Asset } from '../../types/defi-types.js';

/**
 * Blend pool configuration
 * @interface BlendPoolConfig
 */
export interface BlendPoolConfig {
  /** Pool contract address */
  poolAddress: string;
  /** Pool name */
  name: string;
  /** Supported assets in the pool */
  assets: BlendPoolAsset[];
  /** Pool oracle address */
  oracleAddress: string;
}

/**
 * Blend pool asset configuration
 * @interface BlendPoolAsset
 */
export interface BlendPoolAsset {
  /** Asset information */
  asset: Asset;
  /** Asset contract address */
  assetAddress: string;
  /** Collateral factor (0-1) */
  collateralFactor: string;
  /** Liquidation factor (0-1) */
  liquidationFactor: string;
  /** Reserve factor (0-1) */
  reserveFactor: string;
  /** Maximum borrow rate */
  maxBorrowRate: string;
}

/**
 * Blend user position
 * @interface BlendPosition
 */
export interface BlendPosition {
  /** User address */
  address: string;
  /** Supplied positions */
  supplies: BlendSupplyPosition[];
  /** Borrowed positions */
  borrows: BlendBorrowPosition[];
  /** Total collateral value in USD */
  totalCollateralUSD: string;
  /** Total debt value in USD */
  totalDebtUSD: string;
  /** Health factor */
  healthFactor: string;
  /** Liquidation threshold */
  liquidationThreshold: string;
}

/**
 * Blend supply position
 * @interface BlendSupplyPosition
 */
export interface BlendSupplyPosition {
  /** Asset information */
  asset: Asset;
  /** Supplied amount (including interest) */
  amount: string;
  /** Value in USD */
  valueUSD: string;
  /** Current supply APY */
  apy: string;
  /** Whether asset is used as collateral */
  isCollateral: boolean;
}

/**
 * Blend borrow position
 * @interface BlendBorrowPosition
 */
export interface BlendBorrowPosition {
  /** Asset information */
  asset: Asset;
  /** Borrowed amount (including interest) */
  amount: string;
  /** Value in USD */
  valueUSD: string;
  /** Current borrow APY */
  apy: string;
  /** Accrued interest */
  accruedInterest: string;
}

/**
 * Blend reserve data
 * @interface BlendReserveData
 */
export interface BlendReserveData {
  /** Asset information */
  asset: Asset;
  /** Total supply */
  totalSupply: string;
  /** Total borrows */
  totalBorrows: string;
  /** Available liquidity */
  availableLiquidity: string;
  /** Utilization rate (0-1) */
  utilizationRate: string;
  /** Supply APY */
  supplyAPY: string;
  /** Borrow APY */
  borrowAPY: string;
  /** Last update timestamp */
  lastUpdateTime: Date;
}

/**
 * Liquidation opportunity
 * @interface LiquidationOpportunity
 */
export interface LiquidationOpportunity {
  /** User address to liquidate */
  userAddress: string;
  /** Health factor */
  healthFactor: string;
  /** Total collateral value */
  collateralValueUSD: string;
  /** Total debt value */
  debtValueUSD: string;
  /** Collateral assets */
  collateralAssets: BlendSupplyPosition[];
  /** Debt assets */
  debtAssets: BlendBorrowPosition[];
  /** Estimated profit from liquidation */
  estimatedProfitUSD: string;
}

/**
 * Liquidation result
 * @interface LiquidationResult
 */
export interface LiquidationResult {
  /** Transaction hash */
  txHash: string;
  /** Liquidated user address */
  userAddress: string;
  /** Debt asset repaid */
  debtAsset: Asset;
  /** Amount of debt repaid */
  debtAmount: string;
  /** Collateral asset received */
  collateralAsset: Asset;
  /** Amount of collateral received */
  collateralAmount: string;
  /** Profit in USD */
  profitUSD: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Blend protocol event types
 * @enum {string}
 */
export enum BlendEventType {
  SUPPLY = 'supply',
  WITHDRAW = 'withdraw',
  BORROW = 'borrow',
  REPAY = 'repay',
  LIQUIDATION = 'liquidation',
  COLLATERAL_ENABLED = 'collateral_enabled',
  COLLATERAL_DISABLED = 'collateral_disabled'
}

/**
 * Blend protocol event
 * @interface BlendEvent
 */
export interface BlendEvent {
  /** Event type */
  type: BlendEventType;
  /** User address */
  user: string;
  /** Asset involved */
  asset: Asset;
  /** Amount */
  amount: string;
  /** Transaction hash */
  txHash: string;
  /** Timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
