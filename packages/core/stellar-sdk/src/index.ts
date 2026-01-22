/**
 * @fileoverview Main exports for Galaxy Stellar SDK
 * @description Main entry point for the Galaxy Stellar SDK package
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Export types
export type {
  NetworkConfig,
  WalletConfig,
  Wallet,
  Balance,
  AccountInfo,
  PaymentParams,
  PaymentResult,
  TransactionInfo,
  Network,
  Asset,
  TransactionStatus,
} from './types/stellar-types';

// Export services
export { StellarService } from './services/stellar-service';

// Export hooks
export { useStellar } from './hooks/use-stellar';

// Export utilities
export {
  isValidPublicKey,
  isValidSecretKey,
  generateKeypair,
  toStroops,
  fromStroops,
  formatAddress,
  isValidMemo,
  getNetworkPassphrase,
  getHorizonUrl,
  isValidAmount,
  formatBalance,
  isSameAddress,
  createMemo,
  calculateFee,
  isValidAssetCode,
} from './utils/stellar-utils';

// Export Soroban functionality
export * from './soroban';

// Re-export Stellar SDK for convenience
export {
  Keypair,
  Transaction,
  Account,
  Networks,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
