/**
 * @fileoverview Sponsored Reserves Module Exports
 * @description Main entry point for the Galaxy Stellar SDK sponsored reserves functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Export types
export type {
  SponsoredEntryType,
  SponsorshipConfig,
  EntrySpecificConfig,
  AccountEntryConfig,
  TrustlineEntryConfig,
  OfferEntryConfig,
  DataEntryConfig,
  ClaimableBalanceEntryConfig,
  SignerEntryConfig,
  Claimant,
  ClaimPredicate,
  SponsoredEntry,
  SponsorshipCost,
  CostBreakdownItem,
  SponsorshipResult,
  SponsoredEntryInfo,
  RevokeSponsorshipTarget,
  UserOnboardingConfig,
  ClaimableBalanceSponsorshipConfig,
  MultiOperationSponsorshipConfig,
  SponsoredOperation,
  SponsoredEntriesQueryOptions,
  SponsorshipEligibility,
  UnsignedTransactionOptions,
  UnsignedTransactionResult,
} from './types/sponsored-reserves-types';

// Export main manager
export { SponsoredReservesManager } from './services/sponsored-reserves-manager';

// Export builders
export { SponsoredAccountBuilder } from './builders/sponsored-account-builder';
export { SponsoredTrustlineBuilder } from './builders/sponsored-trustline-builder';
export { SponsoredClaimableBalanceBuilder } from './builders/sponsored-claimable-balance-builder';
export { SponsoredSignerBuilder } from './builders/sponsored-signer-builder';
export { SponsoredDataEntryBuilder } from './builders/sponsored-data-entry-builder';

// Export templates
export { UserOnboardingTemplate } from './templates/user-onboarding-template';
export { ClaimableBalanceTemplate } from './templates/claimable-balance-template';
export { MultiOperationTemplate } from './templates/multi-operation-template';

// Export validation utilities
export {
  validatePublicKey,
  validateSecretKey,
  validateSponsorBalance,
  validateOperationSequence,
  validateAssetCode,
  validateAmount,
  validateClaimants,
  validateClaimPredicate,
  validateDataEntryName,
  validateDataEntryValue,
  validateSignerWeight,
  validateEntryType,
  validatePreAuthTxHash,
  validateSha256Hash,
} from './utils/sponsorship-validation';

// Export cost calculation utilities
export {
  BASE_RESERVE_XLM,
  MINIMUM_ACCOUNT_BALANCE_XLM,
  DEFAULT_FEE_STROOPS,
  calculateEntryReserve,
  calculateTotalCost,
  calculateMultipleCost,
  getDetailedBreakdown,
  calculateOnboardingCost,
  calculateMultiOperationCost,
  estimateTransactionFee,
  calculateRequiredSponsorBalance,
  xlmToStroops,
  stroopsToXlm,
  formatCost,
} from './utils/cost-calculator';
