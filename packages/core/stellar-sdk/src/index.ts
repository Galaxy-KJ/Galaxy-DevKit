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
} from './types/stellar-types.js';

// Export services
export { StellarService } from './services/stellar-service.js';

// Export hooks
export { useStellar } from './hooks/use-stellar.js';

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
} from './utils/stellar-utils.js';

// Export Soroban functionality
export * from './soroban/index.js';

// Export claimable balances
export type {
  ClaimableBalance,
  Claimant,
  ClaimPredicate,
  CreateClaimableBalanceParams,
  ClaimBalanceParams,
  QueryClaimableBalancesParams,
  ClaimableBalanceResult,
  TimeLockedBalanceParams,
  VestingScheduleParams,
  EscrowParams,
} from './claimable-balances/types.js';

export {
  ClaimableBalanceManager,
  unconditional,
  beforeAbsoluteTime,
  beforeRelativeTime,
  not,
  and,
  or,
  toStellarPredicate,
  validatePredicate,
  isPredicateClaimable,
  createTimeLockedBalance,
  createVestingSchedule,
  createEscrow,
  createTwoPartyEscrow,
  createConditionalRelease,
  createRefundableBalance,
} from './claimable-balances/index.js';

// Export liquidity pools
export type {
  LiquidityPool,
  LiquidityPoolDeposit,
  LiquidityPoolWithdraw,
  QueryPoolsParams,
  LiquidityPoolResult,
  PoolAnalytics,
  PriceImpact,
  DepositEstimate,
  WithdrawEstimate,
  PoolShare,
  PoolTrade,
} from './liquidity-pools/types.js';

export {
  LiquidityPoolManager,
  // Calculation functions
  calculateConstantProduct,
  calculateSpotPrice,
  calculateDepositShares,
  calculateWithdrawAmounts,
  calculatePriceImpact,
  calculateSwapOutput,
  estimateDeposit,
  estimateWithdraw,
  calculateMinimumAmounts,
  calculatePriceBounds,
  // Validation functions
  validatePoolId,
  validateAmount,
  validateSlippage,
  validatePrice,
  validatePublicKey,
  validateDepositParams,
  validateWithdrawParams,
  validateSufficientShares,
  validateMinimumLiquidity,
  // Helper functions
  calculateOptimalDeposit,
  formatPoolAssets,
  calculateShareValue,
  wouldImpactPrice,
  calculateBreakEvenPrice,
  calculateImpermanentLoss,
  hasSufficientLiquidity,
  calculateAPRFromFees,
  toStellarPrecision,
  assetsEqual,
  sortAssets,
} from './liquidity-pools/index.js';

// Re-export Stellar SDK for convenience
export {
  Keypair,
  Transaction,
  Account,
  Networks,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// Export sponsored reserves module
export * from './sponsored-reserves/index.js';
