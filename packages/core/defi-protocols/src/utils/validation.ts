/**
 * @fileoverview Validation utilities for DeFi operations
 * @description Common validation functions for DeFi protocols
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { Keypair } from '@stellar/stellar-sdk';
import { Asset } from '../types/defi-types.js';
import BigNumber from 'bignumber.js';

/**
 * Validate Stellar address
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 * @throws {Error} If address is invalid
 */
export function validateAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    throw new Error('Address must be a non-empty string');
  }

  try {
    Keypair.fromPublicKey(address);
    return true;
  } catch (error) {
    throw new Error(`Invalid Stellar address: ${address}`);
  }
}

/**
 * Validate amount string
 * @param {string} amount - Amount to validate
 * @param {string} fieldName - Field name for error messages
 * @returns {boolean} True if valid
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

  return true;
}

/**
 * Validate asset structure
 * @param {Asset} asset - Asset to validate
 * @returns {boolean} True if valid
 * @throws {Error} If asset is invalid
 */
export function validateAsset(asset: Asset): boolean {
  if (!asset || typeof asset !== 'object') {
    throw new Error('Asset must be an object');
  }

  if (!asset.code || typeof asset.code !== 'string') {
    throw new Error('Asset code is required and must be a string');
  }

  if (!asset.type || !['native', 'credit_alphanum4', 'credit_alphanum12'].includes(asset.type)) {
    throw new Error('Asset type must be native, credit_alphanum4, or credit_alphanum12');
  }

  if (asset.type !== 'native' && !asset.issuer) {
    throw new Error('Non-native assets must have an issuer');
  }

  if (asset.issuer) {
    validateAddress(asset.issuer);
  }

  return true;
}

/**
 * Validate slippage percentage
 * @param {string} slippage - Slippage percentage (e.g., "0.01" for 1%)
 * @returns {boolean} True if valid
 * @throws {Error} If slippage is invalid
 */
export function validateSlippage(slippage: string): boolean {
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
 * Validate health factor
 * @param {string} healthFactor - Health factor value
 * @returns {boolean} True if healthy (>= 1.0)
 */
export function isHealthyPosition(healthFactor: string): boolean {
  const bn = new BigNumber(healthFactor);
  return bn.isGreaterThanOrEqualTo(1.0);
}

/**
 * Validate minimum amount with slippage
 * @param {string} expectedAmount - Expected output amount
 * @param {string} slippage - Slippage tolerance
 * @returns {string} Minimum amount after slippage
 */
export function calculateMinimumAmount(expectedAmount: string, slippage: string): string {
  validateAmount(expectedAmount, 'Expected amount');
  validateSlippage(slippage);

  const expected = new BigNumber(expectedAmount);
  const slippageTolerance = new BigNumber(slippage);

  return expected.multipliedBy(new BigNumber(1).minus(slippageTolerance)).toFixed();
}

/**
 * Compare two amounts
 * @param {string} amount1 - First amount
 * @param {string} amount2 - Second amount
 * @returns {number} -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 */
export function compareAmounts(amount1: string, amount2: string): number {
  const bn1 = new BigNumber(amount1);
  const bn2 = new BigNumber(amount2);

  const result = bn1.comparedTo(bn2);
  return result !== null ? result : 0;
}
