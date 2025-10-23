/**
 * @fileoverview Utility functions for Stellar operations
 * @description Contains helper functions and utilities for Stellar operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Keypair } from 'stellar-sdk';
import crypto from 'crypto';

/**
 * Validates a Stellar public key
 * @param publicKey - The public key to validate
 * @returns boolean
 */
export const isValidPublicKey = (publicKey: string): boolean => {
  try {
    Keypair.fromPublicKey(publicKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Validates a Stellar secret key
 * @param secretKey - The secret key to validate
 * @returns boolean
 */
export const isValidSecretKey = (secretKey: string): boolean => {
  try {
    Keypair.fromSecret(secretKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * Generates a random Stellar keypair
 * @returns Object with publicKey and secretKey
 */
export const generateKeypair = () => {
  const keypair = Keypair.random();
  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
};

/**
 * Converts Stellar amount to stroops (smallest unit)
 * @param amount - Amount in XLM
 * @returns number of stroops
 */
export const toStroops = (amount: string | number): number => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return Math.floor(numAmount * 10000000); // 1 XLM = 10,000,000 stroops
};

/**
 * Converts stroops to XLM amount
 * @param stroops - Amount in stroops
 * @returns string representation of XLM amount
 */
export const fromStroops = (stroops: number): string => {
  return (stroops / 10000000).toFixed(7);
};

/**
 * Formats a Stellar address for display
 * @param address - Stellar address
 * @param startChars - Number of characters to show at start
 * @param endChars - Number of characters to show at end
 * @returns formatted address
 */
export const formatAddress = (
  address: string,
  startChars: number = 4,
  endChars: number = 4
): string => {
  if (address.length <= startChars + endChars) {
    return address;
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};

/**
 * Validates a Stellar memo
 * @param memo - Memo to validate
 * @returns boolean
 */
export const isValidMemo = (memo: string): boolean => {
  return memo.length <= 28; // Stellar memo text limit
};

/**
 * Converts network name to passphrase
 * @param network - Network name
 * @returns network passphrase
 */
export const getNetworkPassphrase = (
  network: 'testnet' | 'mainnet'
): string => {
  return network === 'testnet'
    ? 'Test SDF Network ; September 2015'
    : 'Public Global Stellar Network ; September 2015';
};

/**
 * Gets Horizon server URL for network
 * @param network - Network name
 * @returns Horizon server URL
 */
export const getHorizonUrl = (network: 'testnet' | 'mainnet'): string => {
  return network === 'testnet'
    ? 'https://horizon-testnet.stellar.org'
    : 'https://horizon.stellar.org';
};

/**
 * Validates if an amount is positive
 * @param amount - Amount to validate
 * @returns boolean
 */
export const isValidAmount = (amount: string | number): boolean => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return !isNaN(numAmount) && numAmount > 0;
};

/**
 * Formats balance for display
 * @param balance - Balance amount
 * @param decimals - Number of decimal places
 * @returns formatted balance string
 */
export const formatBalance = (
  balance: string | number,
  decimals: number = 7
): string => {
  const numBalance =
    typeof balance === 'string' ? parseFloat(balance) : balance;
  return numBalance.toFixed(decimals);
};

/**
 * Checks if two addresses are the same
 * @param address1 - First address
 * @param address2 - Second address
 * @returns boolean
 */
export const isSameAddress = (address1: string, address2: string): boolean => {
  return address1.toLowerCase() === address2.toLowerCase();
};

/**
 * Generates a transaction memo
 * @param text - Memo text
 * @returns memo object
 */
export const createMemo = (text: string) => {
  if (!isValidMemo(text)) {
    throw new Error('Memo text is too long (max 28 characters)');
  }
  return { type: 'text', value: text };
};

/**
 * Calculates transaction fee based on operations
 * @param operationCount - Number of operations
 * @param baseFee - Base fee per operation
 * @returns total fee
 */
export const calculateFee = (
  operationCount: number,
  baseFee: number = 100
): number => {
  return operationCount * baseFee;
};

/**
 * Validates asset code format
 * @param assetCode - Asset code to validate
 * @returns boolean
 */
export const isValidAssetCode = (assetCode: string): boolean => {
  // Asset codes must be 1-12 characters, alphanumeric
  return /^[A-Z0-9]{1,12}$/.test(assetCode);
};

// AES-GCM requires 12-byte IVs for best security
const IV_LENGTH = 12;
const ALGO = 'aes-256-gcm';

/**
 * Encrypt a private key with a password
 */
export function encryptPrivateKey(
  privateKey: string,
  password: string
): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive 256-bit key from password using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Store all parts (salt, iv, authTag, ciphertext)
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a private key with a password
 */
export function decryptPrivateKey(
  encryptedData: string,
  password: string
): string {
  const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(':');

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Validates a Stellar wallet memo.
 * @param memo - Memo to validate
 * @throws Error if memo is invalid
 */
export function validateMemo(memo: string): void {
  if (!memo || typeof memo !== 'string') {
    throw new Error('Memo must be a non-empty string');
  }

  // Reject control characters
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(memo)) {
    throw new Error('Memo contains invalid control characters');
  }

  // Validate allowed memo format (alphanumeric, spaces, hyphens, underscores, and dots)
  if (!/^[a-zA-Z0-9 _.\-]*$/.test(memo)) {
    throw new Error('Invalid Stellar memo format');
  }

  // Check memo byte length (Stellar limit = 28 bytes)
  const memoBytes = new TextEncoder().encode(memo).length;
  if (memoBytes > 28) {
    throw new Error('Memo exceeds maximum length of 28 bytes');
  }
}
