/**
 * @fileoverview Validation functions for liquidity pool operations
 * @description Contains all validation logic for liquidity pool parameters
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-22
 */

import BigNumber from 'bignumber.js';
import { Keypair } from '@stellar/stellar-sdk';
import {
  LiquidityPoolDeposit,
  LiquidityPoolWithdraw,
} from './types';

/**
 * Validates pool ID format (64-character hex string)
 * @param poolId - Pool ID to validate
 * @returns boolean
 * @throws {Error} If pool ID format is invalid
 */
export function validatePoolId(poolId: string): boolean {
  if (!poolId || typeof poolId !== 'string') {
    throw new Error('Pool ID must be a non-empty string');
  }

  if (!/^[0-9a-f]{64}$/i.test(poolId)) {
    throw new Error(
      'Invalid pool ID format. Expected 64-character hexadecimal string'
    );
  }

  return true;
}

/**
 * Validates amount is a valid positive number
 * @param amount - Amount to validate
 * @param fieldName - Name of the field for error messages
 * @returns boolean
 * @throws {Error} If amount is invalid
 */
export function validateAmount(amount: string, fieldName: string = 'Amount'): boolean {
  if (!amount || typeof amount !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  const bn = new BigNumber(amount);

  if (bn.isNaN()) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (bn.isLessThanOrEqualTo(0)) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  if (!bn.isFinite()) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  // Check Stellar's max amount (922337203685.4775807)
  const maxAmount = new BigNumber('922337203685.4775807');
  if (bn.isGreaterThan(maxAmount)) {
    throw new Error(`${fieldName} exceeds maximum Stellar amount`);
  }

  return true;
}

/**
 * Validates slippage tolerance (must be between 0 and 1)
 * @param slippage - Slippage tolerance as a string (e.g., "0.01" for 1%)
 * @returns boolean
 * @throws {Error} If slippage is invalid
 */
export function validateSlippage(slippage: string): boolean {
  if (!slippage || typeof slippage !== 'string') {
    throw new Error('Slippage must be a non-empty string');
  }

  const bn = new BigNumber(slippage);

  if (bn.isNaN()) {
    throw new Error('Slippage must be a valid number');
  }

  if (bn.isLessThan(0) || bn.isGreaterThan(1)) {
    throw new Error('Slippage must be between 0 and 1 (0% to 100%)');
  }

  return true;
}

/**
 * Validates price bounds
 * @param price - Price to validate
 * @param fieldName - Name of the field for error messages
 * @returns boolean
 * @throws {Error} If price is invalid
 */
export function validatePrice(price: string, fieldName: string = 'Price'): boolean {
  if (!price || typeof price !== 'string') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  const bn = new BigNumber(price);

  if (bn.isNaN()) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (bn.isLessThanOrEqualTo(0)) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  if (!bn.isFinite()) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  return true;
}

/**
 * Validates public key format
 * @param publicKey - Public key to validate
 * @returns boolean
 * @throws {Error} If public key is invalid
 */
export function validatePublicKey(publicKey: string): boolean {
  if (!publicKey || typeof publicKey !== 'string') {
    throw new Error('Public key must be a non-empty string');
  }

  try {
    Keypair.fromPublicKey(publicKey);
    return true;
  } catch (error) {
    throw new Error(`Invalid public key: ${publicKey}`);
  }
}

/**
 * Validates deposit liquidity parameters
 * @param params - Deposit parameters to validate
 * @throws {Error} If any parameter is invalid
 */
export function validateDepositParams(params: LiquidityPoolDeposit): void {
  // Validate pool ID
  validatePoolId(params.poolId);

  // Validate amounts
  validateAmount(params.maxAmountA, 'maxAmountA');
  validateAmount(params.maxAmountB, 'maxAmountB');

  // Validate slippage tolerance if provided
  if (params.slippageTolerance) {
    validateSlippage(params.slippageTolerance);
  }

  // Validate price bounds if provided
  if (params.minPrice) {
    validatePrice(params.minPrice, 'minPrice');
  }

  if (params.maxPrice) {
    validatePrice(params.maxPrice, 'maxPrice');
  }

  // Validate price relationship if both provided
  if (params.minPrice && params.maxPrice) {
    const minPrice = new BigNumber(params.minPrice);
    const maxPrice = new BigNumber(params.maxPrice);

    if (minPrice.isGreaterThanOrEqualTo(maxPrice)) {
      throw new Error('minPrice must be less than maxPrice');
    }
  }

  // Validate fee if provided
  if (params.fee !== undefined) {
    if (typeof params.fee !== 'number' || params.fee < 0) {
      throw new Error('Fee must be a non-negative number');
    }
  }

  // Validate memo if provided
  if (params.memo && typeof params.memo !== 'string') {
    throw new Error('Memo must be a string');
  }
}

/**
 * Validates withdraw liquidity parameters
 * @param params - Withdraw parameters to validate
 * @throws {Error} If any parameter is invalid
 */
export function validateWithdrawParams(params: LiquidityPoolWithdraw): void {
  // Validate pool ID
  validatePoolId(params.poolId);

  // Validate shares amount
  validateAmount(params.shares, 'shares');

  // Validate minimum amounts if provided
  if (params.minAmountA) {
    validateAmount(params.minAmountA, 'minAmountA');
  }

  if (params.minAmountB) {
    validateAmount(params.minAmountB, 'minAmountB');
  }

  // Validate slippage tolerance if provided
  if (params.slippageTolerance) {
    validateSlippage(params.slippageTolerance);
  }

  // Validate fee if provided
  if (params.fee !== undefined) {
    if (typeof params.fee !== 'number' || params.fee < 0) {
      throw new Error('Fee must be a non-negative number');
    }
  }

  // Validate memo if provided
  if (params.memo && typeof params.memo !== 'string') {
    throw new Error('Memo must be a string');
  }
}

/**
 * Validates that user has sufficient shares for withdrawal
 * @param requestedShares - Shares user wants to withdraw
 * @param availableShares - Shares user has
 * @returns boolean
 * @throws {Error} If insufficient shares
 */
export function validateSufficientShares(
  requestedShares: string,
  availableShares: string
): boolean {
  const requested = new BigNumber(requestedShares);
  const available = new BigNumber(availableShares);

  if (requested.isGreaterThan(available)) {
    throw new Error(
      `Insufficient shares. Requested: ${requestedShares}, Available: ${availableShares}`
    );
  }

  return true;
}

/**
 * Validates minimum liquidity to prevent dust attacks
 * @param amountA - Amount of asset A
 * @param amountB - Amount of asset B
 * @param minLiquidity - Minimum liquidity threshold (default: 0.0000001)
 * @returns boolean
 * @throws {Error} If liquidity is below minimum
 */
export function validateMinimumLiquidity(
  amountA: string,
  amountB: string,
  minLiquidity: string = '0.0000001'
): boolean {
  const product = new BigNumber(amountA).multipliedBy(amountB);
  const sqrt = product.sqrt();
  const minThreshold = new BigNumber(minLiquidity);

  if (sqrt.isLessThan(minThreshold)) {
    throw new Error(
      `Liquidity below minimum threshold. Calculated: ${sqrt.toFixed(7)}, Minimum: ${minLiquidity}`
    );
  }

  return true;
}
