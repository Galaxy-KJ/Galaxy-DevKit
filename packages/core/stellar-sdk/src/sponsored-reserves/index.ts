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
} from './types/sponsored-reserves-types.js';

// Export main manager
export { SponsoredReservesManager } from './services/sponsored-reserves-manager.js';

// Export builders
export { SponsoredAccountBuilder } from './builders/sponsored-account-builder.js';
export { SponsoredTrustlineBuilder } from './builders/sponsored-trustline-builder.js';
export { SponsoredClaimableBalanceBuilder } from './builders/sponsored-claimable-balance-builder.js';
export { SponsoredSignerBuilder } from './builders/sponsored-signer-builder.js';
export { SponsoredDataEntryBuilder } from './builders/sponsored-data-entry-builder.js';

// Export templates
export { UserOnboardingTemplate } from './templates/user-onboarding-template.js';
export { ClaimableBalanceTemplate } from './templates/claimable-balance-template.js';
export { MultiOperationTemplate } from './templates/multi-operation-template.js';

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
} from './utils/sponsorship-validation.js';

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
} from './utils/cost-calculator.js';
