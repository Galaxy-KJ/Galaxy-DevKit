/**
 * @fileoverview Protocol operation types using discriminated unions
 * @description Defines all operation types for DeFi protocol interactions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { Asset } from './defi-types';

/**
 * Operation type enumeration
 * @enum {string}
 */
export enum OperationType {
  /** Supply/deposit operation */
  SUPPLY = 'supply',
  /** Withdraw operation */
  WITHDRAW = 'withdraw',
  /** Borrow operation */
  BORROW = 'borrow',
  /** Repay operation */
  REPAY = 'repay',
  /** Swap operation */
  SWAP = 'swap',
  /** Add liquidity operation */
  ADD_LIQUIDITY = 'add_liquidity',
  /** Remove liquidity operation */
  REMOVE_LIQUIDITY = 'remove_liquidity'
}

/**
 * Base operation interface
 * @interface BaseOperation
 * @description Common properties for all protocol operations
 */
export interface BaseOperation {
  /** Operation type discriminator */
  readonly type: OperationType;
  /** Timestamp when operation was created */
  timestamp: Date;
  /** Optional memo for the operation */
  memo?: string;
  /** User wallet address */
  walletAddress: string;
}

/**
 * Supply/Deposit operation
 * @interface SupplyOperation
 * @extends BaseOperation
 * @description Deposit assets into a lending protocol
 */
export interface SupplyOperation extends BaseOperation {
  readonly type: OperationType.SUPPLY;
  /** Asset to supply */
  asset: Asset;
  /** Amount to supply (string for precision) */
  amount: string;
}

/**
 * Withdraw operation
 * @interface WithdrawOperation
 * @extends BaseOperation
 * @description Withdraw supplied assets from a protocol
 */
export interface WithdrawOperation extends BaseOperation {
  readonly type: OperationType.WITHDRAW;
  /** Asset to withdraw */
  asset: Asset;
  /** Amount to withdraw (string for precision) */
  amount: string;
}

/**
 * Borrow operation
 * @interface BorrowOperation
 * @extends BaseOperation
 * @description Borrow assets from a lending protocol
 */
export interface BorrowOperation extends BaseOperation {
  readonly type: OperationType.BORROW;
  /** Asset to borrow */
  asset: Asset;
  /** Amount to borrow (string for precision) */
  amount: string;
  /** Collateral asset used */
  collateralAsset?: Asset;
}

/**
 * Repay operation
 * @interface RepayOperation
 * @extends BaseOperation
 * @description Repay borrowed assets
 */
export interface RepayOperation extends BaseOperation {
  readonly type: OperationType.REPAY;
  /** Asset to repay */
  asset: Asset;
  /** Amount to repay (string for precision) */
  amount: string;
  /** Whether to repay full debt */
  repayAll?: boolean;
}

/**
 * Swap operation
 * @interface SwapOperation
 * @extends BaseOperation
 * @description Token swap on a DEX protocol
 */
export interface SwapOperation extends BaseOperation {
  readonly type: OperationType.SWAP;
  /** Input token */
  tokenIn: Asset;
  /** Output token */
  tokenOut: Asset;
  /** Amount of input token */
  amountIn: string;
  /** Minimum amount of output token (slippage protection) */
  minAmountOut: string;
  /** Maximum slippage percentage (e.g., "0.01" for 1%) */
  slippageTolerance?: string;
  /** Swap deadline timestamp */
  deadline?: Date;
}

/**
 * Add liquidity operation
 * @interface AddLiquidityOperation
 * @extends BaseOperation
 * @description Add liquidity to a pool
 */
export interface AddLiquidityOperation extends BaseOperation {
  readonly type: OperationType.ADD_LIQUIDITY;
  /** First token in the pair */
  tokenA: Asset;
  /** Second token in the pair */
  tokenB: Asset;
  /** Amount of first token */
  amountA: string;
  /** Amount of second token */
  amountB: string;
  /** Minimum LP tokens to receive */
  minLPTokens?: string;
}

/**
 * Remove liquidity operation
 * @interface RemoveLiquidityOperation
 * @extends BaseOperation
 * @description Remove liquidity from a pool
 */
export interface RemoveLiquidityOperation extends BaseOperation {
  readonly type: OperationType.REMOVE_LIQUIDITY;
  /** Pool address */
  poolAddress: string;
  /** Amount of LP tokens to burn */
  lpTokenAmount: string;
  /** Minimum amount of token A to receive */
  minAmountA?: string;
  /** Minimum amount of token B to receive */
  minAmountB?: string;
}

/**
 * Union type of all protocol operations
 * @typedef {SupplyOperation | WithdrawOperation | BorrowOperation | RepayOperation | SwapOperation | AddLiquidityOperation | RemoveLiquidityOperation} ProtocolOperation
 * @description Discriminated union of all possible protocol operations
 */
export type ProtocolOperation =
  | SupplyOperation
  | WithdrawOperation
  | BorrowOperation
  | RepayOperation
  | SwapOperation
  | AddLiquidityOperation
  | RemoveLiquidityOperation;

/**
 * Operation result status
 * @enum {string}
 */
export enum OperationStatus {
  /** Operation is pending */
  PENDING = 'pending',
  /** Operation is being simulated */
  SIMULATING = 'simulating',
  /** Operation is being submitted */
  SUBMITTING = 'submitting',
  /** Operation succeeded */
  SUCCESS = 'success',
  /** Operation failed */
  FAILED = 'failed',
  /** Operation was cancelled */
  CANCELLED = 'cancelled'
}

/**
 * Gas estimation result
 * @interface GasEstimation
 * @description Result of gas estimation for an operation
 */
export interface GasEstimation {
  /** Estimated gas/fee in stroops */
  estimatedFee: string;
  /** Resource footprint for Soroban operations */
  resourceFootprint?: {
    cpu: number;
    memory: number;
    ledgerReadBytes: number;
    ledgerWriteBytes: number;
  };
  /** Whether the estimation is accurate or a rough estimate */
  isAccurate: boolean;
}

/**
 * Operation builder options
 * @interface OperationBuilderOptions
 * @description Options for building protocol operations
 */
export interface OperationBuilderOptions {
  /** Whether to simulate before submitting */
  simulate?: boolean;
  /** Maximum fee willing to pay */
  maxFee?: string;
  /** Transaction timeout in seconds */
  timeoutSeconds?: number;
  /** Additional operation metadata */
  metadata?: Record<string, unknown>;
}
