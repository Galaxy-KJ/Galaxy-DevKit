/**
 * @fileoverview Validation utilities for sponsored reserves operations
 * @description Contains validation functions for sponsorship operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { StrKey } from '@stellar/stellar-sdk';
import { Claimant, SponsoredEntryType } from '../types/sponsored-reserves-types.js';

/**
 * Validates a Stellar public key
 * @param publicKey - The public key to validate
 * @returns true if valid, false otherwise
 */
export function validatePublicKey(publicKey: string): boolean {
  if (!publicKey || typeof publicKey !== 'string') {
    return false;
  }
  try {
    return StrKey.isValidEd25519PublicKey(publicKey);
  } catch {
    return false;
  }
}

/**
 * Validates a Stellar secret key
 * @param secretKey - The secret key to validate
 * @returns true if valid, false otherwise
 */
export function validateSecretKey(secretKey: string): boolean {
  if (!secretKey || typeof secretKey !== 'string') {
    return false;
  }
  try {
    return StrKey.isValidEd25519SecretSeed(secretKey);
  } catch {
    return false;
  }
}

/**
 * Validates that sponsor has sufficient balance for sponsorship
 * @param currentBalance - Current balance in XLM
 * @param requiredAmount - Required amount in XLM
 * @param reserveBuffer - Additional buffer to maintain (default 1 XLM)
 * @returns Validation result with details
 */
export function validateSponsorBalance(
  currentBalance: string,
  requiredAmount: string,
  reserveBuffer: string = '1'
): { valid: boolean; shortfall?: string; message?: string } {
  const current = parseFloat(currentBalance);
  const required = parseFloat(requiredAmount);
  const buffer = parseFloat(reserveBuffer);

  if (isNaN(current) || isNaN(required) || isNaN(buffer)) {
    return {
      valid: false,
      message: 'Invalid balance values provided',
    };
  }

  const totalRequired = required + buffer;

  if (current < totalRequired) {
    const shortfall = (totalRequired - current).toFixed(7);
    return {
      valid: false,
      shortfall,
      message: `Insufficient balance. Need ${totalRequired.toFixed(7)} XLM (including ${buffer.toFixed(7)} XLM buffer), have ${current.toFixed(7)} XLM`,
    };
  }

  return { valid: true };
}

/**
 * Validates that begin/end sponsoring operations are properly paired
 * @param operations - Array of operation types
 * @returns Validation result
 */
export function validateOperationSequence(
  operations: string[]
): { valid: boolean; message?: string } {
  let sponsorshipDepth = 0;
  let lastBeginIndex = -1;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    if (op === 'beginSponsoringFutureReserves') {
      if (sponsorshipDepth > 0) {
        return {
          valid: false,
          message: `Nested sponsorship detected at operation ${i}. Cannot begin sponsoring while already sponsoring.`,
        };
      }
      sponsorshipDepth++;
      lastBeginIndex = i;
    } else if (op === 'endSponsoringFutureReserves') {
      if (sponsorshipDepth === 0) {
        return {
          valid: false,
          message: `Unmatched endSponsoringFutureReserves at operation ${i}. No active sponsorship to end.`,
        };
      }
      sponsorshipDepth--;
    }
  }

  if (sponsorshipDepth !== 0) {
    return {
      valid: false,
      message: `Unmatched beginSponsoringFutureReserves at operation ${lastBeginIndex}. Missing endSponsoringFutureReserves.`,
    };
  }

  return { valid: true };
}

/**
 * Validates an asset code
 * @param assetCode - The asset code to validate
 * @returns true if valid, false otherwise
 */
export function validateAssetCode(assetCode: string): boolean {
  if (!assetCode || typeof assetCode !== 'string') {
    return false;
  }

  // Asset codes must be 1-12 alphanumeric characters
  if (assetCode.length < 1 || assetCode.length > 12) {
    return false;
  }

  // Must be alphanumeric (Stellar allows uppercase letters and numbers)
  return /^[a-zA-Z0-9]+$/.test(assetCode);
}

/**
 * Validates an amount string
 * @param amount - The amount to validate
 * @param allowZero - Whether to allow zero amount (default false)
 * @returns true if valid, false otherwise
 */
export function validateAmount(amount: string, allowZero: boolean = false): boolean {
  if (!amount || typeof amount !== 'string') {
    return false;
  }

  const numAmount = parseFloat(amount);

  if (isNaN(numAmount)) {
    return false;
  }

  if (!allowZero && numAmount <= 0) {
    return false;
  }

  if (allowZero && numAmount < 0) {
    return false;
  }

  // Stellar amounts can have up to 7 decimal places
  const parts = amount.split('.');
  if (parts.length === 2 && parts[1].length > 7) {
    return false;
  }

  return true;
}

/**
 * Validates claimants array for claimable balance
 * @param claimants - Array of claimants
 * @returns Validation result
 */
export function validateClaimants(
  claimants: Claimant[]
): { valid: boolean; message?: string } {
  if (!Array.isArray(claimants)) {
    return {
      valid: false,
      message: 'Claimants must be an array',
    };
  }

  if (claimants.length === 0) {
    return {
      valid: false,
      message: 'At least one claimant is required',
    };
  }

  if (claimants.length > 10) {
    return {
      valid: false,
      message: 'Maximum 10 claimants allowed per claimable balance',
    };
  }

  for (let i = 0; i < claimants.length; i++) {
    const claimant = claimants[i];

    if (!claimant.destination) {
      return {
        valid: false,
        message: `Claimant at index ${i} is missing destination`,
      };
    }

    if (!validatePublicKey(claimant.destination)) {
      return {
        valid: false,
        message: `Claimant at index ${i} has invalid destination public key`,
      };
    }

    if (!claimant.predicate) {
      return {
        valid: false,
        message: `Claimant at index ${i} is missing predicate`,
      };
    }

    const predicateValidation = validateClaimPredicate(claimant.predicate);
    if (!predicateValidation.valid) {
      return {
        valid: false,
        message: `Claimant at index ${i}: ${predicateValidation.message}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validates a claim predicate
 * @param predicate - The predicate to validate
 * @param depth - Current nesting depth (for recursion limit)
 * @returns Validation result
 */
export function validateClaimPredicate(
  predicate: any,
  depth: number = 0
): { valid: boolean; message?: string } {
  if (depth > 10) {
    return {
      valid: false,
      message: 'Predicate nesting too deep (max 10 levels)',
    };
  }

  if (!predicate || typeof predicate !== 'object') {
    return {
      valid: false,
      message: 'Invalid predicate format',
    };
  }

  // Check for unconditional
  if ('unconditional' in predicate) {
    if (predicate.unconditional !== true) {
      return {
        valid: false,
        message: 'Unconditional predicate must have value true',
      };
    }
    return { valid: true };
  }

  // Check for AND
  if ('and' in predicate) {
    if (!Array.isArray(predicate.and) || predicate.and.length !== 2) {
      return {
        valid: false,
        message: 'AND predicate must have exactly 2 predicates',
      };
    }
    for (const p of predicate.and) {
      const result = validateClaimPredicate(p, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  // Check for OR
  if ('or' in predicate) {
    if (!Array.isArray(predicate.or) || predicate.or.length !== 2) {
      return {
        valid: false,
        message: 'OR predicate must have exactly 2 predicates',
      };
    }
    for (const p of predicate.or) {
      const result = validateClaimPredicate(p, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  // Check for NOT
  if ('not' in predicate) {
    return validateClaimPredicate(predicate.not, depth + 1);
  }

  // Check for beforeAbsoluteTime
  if ('beforeAbsoluteTime' in predicate) {
    const time = predicate.beforeAbsoluteTime;
    if (typeof time !== 'string' && typeof time !== 'number') {
      return {
        valid: false,
        message: 'beforeAbsoluteTime must be a timestamp string or number',
      };
    }
    return { valid: true };
  }

  // Check for beforeRelativeTime
  if ('beforeRelativeTime' in predicate) {
    const time = predicate.beforeRelativeTime;
    if (typeof time !== 'string' && typeof time !== 'number') {
      return {
        valid: false,
        message: 'beforeRelativeTime must be a duration string or number',
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    message: 'Unknown predicate type',
  };
}

/**
 * Validates a data entry name
 * @param name - The data entry name
 * @returns true if valid, false otherwise
 */
export function validateDataEntryName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Data entry names can be up to 64 characters
  if (name.length < 1 || name.length > 64) {
    return false;
  }

  return true;
}

/**
 * Validates a data entry value
 * @param value - The data entry value
 * @returns true if valid, false otherwise
 */
export function validateDataEntryValue(value: string | Buffer): boolean {
  if (!value) {
    return false;
  }

  // Data entry values can be up to 64 bytes
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'base64');
    return bytes.length <= 64;
  }

  if (Buffer.isBuffer(value)) {
    return value.length <= 64;
  }

  return false;
}

/**
 * Validates a signer weight
 * @param weight - The signer weight
 * @returns true if valid, false otherwise
 */
export function validateSignerWeight(weight: number): boolean {
  if (typeof weight !== 'number' || isNaN(weight)) {
    return false;
  }

  // Signer weight must be 0-255
  return Number.isInteger(weight) && weight >= 0 && weight <= 255;
}

/**
 * Validates an entry type
 * @param entryType - The entry type to validate
 * @returns true if valid, false otherwise
 */
export function validateEntryType(entryType: string): entryType is SponsoredEntryType {
  const validTypes: SponsoredEntryType[] = [
    'account',
    'trustline',
    'offer',
    'data',
    'claimable_balance',
    'signer',
  ];
  return validTypes.includes(entryType as SponsoredEntryType);
}

/**
 * Validates a pre-auth transaction hash
 * Pre-auth transaction hashes start with 'T' and are 56 characters
 * @param hash - The hash to validate
 * @returns true if valid, false otherwise
 */
export function validatePreAuthTxHash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  try {
    // Pre-auth transaction hashes are encoded with the 'T' prefix
    // and should be 56 characters (base32 encoded)
    return hash.startsWith('T') && hash.length === 56 && /^[A-Z2-7]+$/.test(hash);
  } catch {
    return false;
  }
}

/**
 * Validates a SHA256 hash for signer
 * SHA256 hashes start with 'X' and are 56 characters
 * @param hash - The hash to validate
 * @returns true if valid, false otherwise
 */
export function validateSha256Hash(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }

  try {
    // SHA256 hashes are encoded with the 'X' prefix
    // and should be 56 characters (base32 encoded)
    return hash.startsWith('X') && hash.length === 56 && /^[A-Z2-7]+$/.test(hash);
  } catch {
    return false;
  }
}
