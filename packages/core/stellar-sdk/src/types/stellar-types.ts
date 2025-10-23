/**
 * @fileoverview Type definitions for Stellar operations
 * @description Contains all interfaces and types related to Stellar functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Keypair, Transaction, Account } from 'stellar-sdk';

/**
 * Network configuration for Stellar operations
 * @interface NetworkConfig
 * @property {string} network - The network to connect to
 * @property {string} horizonUrl - Horizon server URL
 * @property {string} passphrase - Network passphrase
 */
export interface NetworkConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  passphrase: string;
}

/**
 * Wallet configuration for Stellar operations
 * @interface WalletConfig
 * @property {string} publicKey - The wallet's public key
 * @property {string} privateKey - The wallet's private key (encrypted)
 * @property {NetworkConfig} network - Network configuration
 * @property {boolean} autoConnect - Whether to auto-connect on initialization
 * @property {number} timeout - Request timeout in milliseconds
 */
export interface WalletConfig {
  publicKey: string;
  privateKey: string;
  network: NetworkConfig;
  autoConnect: boolean;
  timeout: number;
}

/**
 * Wallet information structure
 * @interface Wallet
 * @property {string} id - Unique wallet identifier
 * @property {string} publicKey - Wallet's public key
 * @property {string} privateKey - Wallet's private key (encrypted)
 * @property {NetworkConfig} network - Network configuration
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} updatedAt - Last update timestamp
 * @property {Record<string, unknown>} metadata - Additional wallet metadata
 */
export interface Wallet {
  id: string;
  publicKey: string;
  privateKey: string;
  network: NetworkConfig;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Account balance information
 * @interface Balance
 * @property {string} asset - Asset code (XLM for native)
 * @property {string} balance - Account balance
 * @property {string} limit - Trust limit (for non-native assets)
 * @property {string} buyingLiabilities - Buying liabilities
 * @property {string} sellingLiabilities - Selling liabilities
 */
export interface Balance {
  asset: string;
  balance: string;
  limit?: string;
  buyingLiabilities?: string;
  sellingLiabilities?: string;
}

/**
 * Account information structure
 * @interface AccountInfo
 * @property {string} accountId - Account identifier
 * @property {string} sequence - Account sequence number
 * @property {Balance[]} balances - Account balances
 * @property {string} subentryCount - Number of subentries
 * @property {string} inflationDestination - Inflation destination
 * @property {string} homeDomain - Home domain
 * @property {Record<string, unknown>} data - Account data
 */
export interface AccountInfo {
  accountId: string;
  sequence: string;
  balances: Balance[];
  subentryCount: string;
  inflationDestination?: string;
  homeDomain?: string;
  data: Record<string, unknown>;
}

/**
 * Payment parameters for transaction creation
 * @interface PaymentParams
 * @property {string} destination - Destination account
 * @property {string} amount - Amount to send
 * @property {string} asset - Asset code (XLM for native)
 * @property {string} memo - Optional memo
 * @property {number} fee - Transaction fee
 */
export interface PaymentParams {
  destination: string;
  amount: string;
  asset: string;
  memo?: string;
  fee?: number;
}

/**
 * Payment result structure
 * @interface PaymentResult
 * @property {string} hash - Transaction hash
 * @property {string} status - Transaction status
 * @property {string} ledger - Ledger number
 * @property {Date} createdAt - Creation timestamp
 */
export interface PaymentResult {
  hash: string;
  status: string;
  ledger: string;
  createdAt: Date;
}

/**
 * Transaction information
 * @interface TransactionInfo
 * @property {string} hash - Transaction hash
 * @property {string} source - Source account
 * @property {string} destination - Destination account
 * @property {string} amount - Transaction amount
 * @property {string} asset - Asset code
 * @property {string} memo - Transaction memo
 * @property {string} status - Transaction status
 * @property {Date} createdAt - Creation timestamp
 */
export interface TransactionInfo {
  hash: string;
  source: string;
  destination: string;
  amount: string;
  asset: string;
  memo?: string;
  status: string;
  createdAt: Date;
}

/**
 * Network type definition
 * @type Network
 */
export type Network = 'testnet' | 'mainnet';

/**
 * Asset type definition
 * @type Asset
 */
export type Asset = 'XLM' | string;

/**
 * Transaction status type
 * @type TransactionStatus
 */
export type TransactionStatus = 'pending' | 'success' | 'failed' | 'cancelled';
