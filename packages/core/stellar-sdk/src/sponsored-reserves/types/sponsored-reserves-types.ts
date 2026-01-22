/**
 * @fileoverview Type definitions for Stellar sponsored reserves functionality
 * @description Contains all interfaces and types related to sponsored reserves operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Asset, xdr } from '@stellar/stellar-sdk';

/**
 * Types of ledger entries that can be sponsored
 * @type SponsoredEntryType
 */
export type SponsoredEntryType =
  | 'account'
  | 'trustline'
  | 'offer'
  | 'data'
  | 'claimable_balance'
  | 'signer';

/**
 * Configuration for a single sponsorship operation
 * @interface SponsorshipConfig
 */
export interface SponsorshipConfig {
  /** Public key of the account sponsoring reserves */
  sponsorPublicKey: string;
  /** Public key of the account being sponsored */
  sponsoredPublicKey: string;
  /** Type of entry being sponsored */
  entryType: SponsoredEntryType;
  /** Additional configuration based on entry type */
  entryConfig?: EntrySpecificConfig;
}

/**
 * Entry-specific configuration union type
 */
export type EntrySpecificConfig =
  | AccountEntryConfig
  | TrustlineEntryConfig
  | OfferEntryConfig
  | DataEntryConfig
  | ClaimableBalanceEntryConfig
  | SignerEntryConfig;

/**
 * Configuration for sponsored account creation
 * @interface AccountEntryConfig
 */
export interface AccountEntryConfig {
  type: 'account';
  /** Starting balance for the new account (minimum 0 when sponsored) */
  startingBalance: string;
}

/**
 * Configuration for sponsored trustline creation
 * @interface TrustlineEntryConfig
 */
export interface TrustlineEntryConfig {
  type: 'trustline';
  /** Asset code */
  assetCode: string;
  /** Asset issuer public key */
  assetIssuer: string;
  /** Trust limit (optional, defaults to max) */
  limit?: string;
}

/**
 * Configuration for sponsored offer creation
 * @interface OfferEntryConfig
 */
export interface OfferEntryConfig {
  type: 'offer';
  /** Asset being sold */
  selling: {
    code: string;
    issuer?: string;
  };
  /** Asset being bought */
  buying: {
    code: string;
    issuer?: string;
  };
  /** Amount being sold */
  amount: string;
  /** Price ratio (n/d) */
  price: string | { n: number; d: number };
}

/**
 * Configuration for sponsored data entry creation
 * @interface DataEntryConfig
 */
export interface DataEntryConfig {
  type: 'data';
  /** Data entry name (max 64 characters) */
  name: string;
  /** Data entry value (max 64 bytes when base64 encoded) */
  value: string | Buffer;
}

/**
 * Configuration for sponsored claimable balance creation
 * @interface ClaimableBalanceEntryConfig
 */
export interface ClaimableBalanceEntryConfig {
  type: 'claimable_balance';
  /** Asset for the claimable balance */
  asset: {
    code: string;
    issuer?: string;
  };
  /** Amount of the claimable balance */
  amount: string;
  /** Claimants for the balance */
  claimants: Claimant[];
}

/**
 * Claimant definition for claimable balances
 * @interface Claimant
 */
export interface Claimant {
  /** Claimant's public key */
  destination: string;
  /** Predicate for when the claimant can claim */
  predicate: ClaimPredicate;
}

/**
 * Claim predicate types
 */
export type ClaimPredicate =
  | { unconditional: true }
  | { and: ClaimPredicate[] }
  | { or: ClaimPredicate[] }
  | { not: ClaimPredicate }
  | { beforeAbsoluteTime: string }
  | { beforeRelativeTime: string };

/**
 * Configuration for sponsored signer creation
 * @interface SignerEntryConfig
 */
export interface SignerEntryConfig {
  type: 'signer';
  /** Signer key (public key, pre-auth tx hash, or sha256 hash) */
  signerKey: string;
  /** Signer type */
  signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash';
  /** Signer weight */
  weight: number;
}

/**
 * Information about a sponsored entry
 * @interface SponsoredEntry
 */
export interface SponsoredEntry {
  /** Type of the sponsored entry */
  entryType: SponsoredEntryType;
  /** Public key of the sponsor */
  sponsor: string;
  /** Public key of the sponsored account */
  sponsoredAccount: string;
  /** Entry-specific identifier */
  entryId: string;
  /** Additional entry details */
  details: Record<string, unknown>;
}

/**
 * Cost breakdown for sponsorship operations
 * @interface SponsorshipCost
 */
export interface SponsorshipCost {
  /** Total cost in XLM */
  totalCost: string;
  /** Base reserve per entry (currently 0.5 XLM) */
  baseReserve: string;
  /** Number of entries being sponsored */
  entryCount: number;
  /** Detailed breakdown per entry */
  breakdown: CostBreakdownItem[];
  /** Estimated transaction fee */
  transactionFee: string;
}

/**
 * Individual cost breakdown item
 * @interface CostBreakdownItem
 */
export interface CostBreakdownItem {
  /** Entry type */
  type: SponsoredEntryType;
  /** Number of this entry type */
  count: number;
  /** Cost for this entry type */
  cost: string;
  /** Description */
  description: string;
}

/**
 * Result of a sponsorship transaction
 * @interface SponsorshipResult
 */
export interface SponsorshipResult {
  /** Transaction hash */
  hash: string;
  /** Transaction status */
  status: 'success' | 'failed';
  /** Ledger number */
  ledger: string;
  /** Created timestamp */
  createdAt: Date;
  /** Sponsored entries created */
  sponsoredEntries: SponsoredEntryInfo[];
  /** Transaction fee paid */
  feePaid: string;
}

/**
 * Brief info about a sponsored entry in result
 * @interface SponsoredEntryInfo
 */
export interface SponsoredEntryInfo {
  type: SponsoredEntryType;
  id?: string;
}

/**
 * Target for revoking sponsorship
 * @interface RevokeSponsorshipTarget
 */
export interface RevokeSponsorshipTarget {
  /** Type of entry to revoke sponsorship from */
  entryType: SponsoredEntryType;
  /** Account public key (required for most types) */
  accountPublicKey?: string;
  /** Asset (required for trustline) */
  asset?: {
    code: string;
    issuer?: string;
  };
  /** Offer ID (required for offer) */
  offerId?: string;
  /** Data entry name (required for data) */
  dataName?: string;
  /** Claimable balance ID (required for claimable_balance) */
  balanceId?: string;
  /** Signer key (required for signer) */
  signerKey?: string;
}

/**
 * Configuration for user onboarding template
 * @interface UserOnboardingConfig
 */
export interface UserOnboardingConfig {
  /** Sponsor public key */
  sponsorPublicKey: string;
  /** New user's public key */
  newUserPublicKey: string;
  /** Starting balance for the new account */
  startingBalance?: string;
  /** Trustlines to add */
  trustlines?: Array<{
    assetCode: string;
    assetIssuer: string;
    limit?: string;
  }>;
  /** Data entries to add */
  dataEntries?: Array<{
    name: string;
    value: string;
  }>;
  /** Optional memo */
  memo?: string;
}

/**
 * Configuration for claimable balance sponsorship template
 * @interface ClaimableBalanceSponsorshipConfig
 */
export interface ClaimableBalanceSponsorshipConfig {
  /** Sponsor public key */
  sponsorPublicKey: string;
  /** Source account for the claimable balance */
  sourcePublicKey: string;
  /** Asset for the claimable balance */
  asset: {
    code: string;
    issuer?: string;
  };
  /** Amount */
  amount: string;
  /** Claimants */
  claimants: Claimant[];
  /** Optional memo */
  memo?: string;
}

/**
 * Configuration for multi-operation sponsorship template
 * @interface MultiOperationSponsorshipConfig
 */
export interface MultiOperationSponsorshipConfig {
  /** Sponsor public key */
  sponsorPublicKey: string;
  /** Sponsored account public key */
  sponsoredPublicKey: string;
  /** Operations to sponsor */
  operations: SponsoredOperation[];
  /** Optional memo */
  memo?: string;
}

/**
 * A single sponsored operation
 * @interface SponsoredOperation
 */
export interface SponsoredOperation {
  /** Operation type */
  type: 'createAccount' | 'changeTrust' | 'manageData' | 'setOptions';
  /** Operation parameters */
  params: Record<string, unknown>;
}

/**
 * Options for querying sponsored entries
 * @interface SponsoredEntriesQueryOptions
 */
export interface SponsoredEntriesQueryOptions {
  /** Filter by entry type */
  entryType?: SponsoredEntryType;
  /** Maximum number of results */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
  /** Order of results */
  order?: 'asc' | 'desc';
}

/**
 * Result of sponsorship eligibility check
 * @interface SponsorshipEligibility
 */
export interface SponsorshipEligibility {
  /** Whether the sponsor is eligible */
  eligible: boolean;
  /** Current sponsor balance */
  currentBalance: string;
  /** Required balance for sponsorship */
  requiredBalance: string;
  /** Shortfall if not eligible */
  shortfall?: string;
  /** Reason if not eligible */
  reason?: string;
}

/**
 * Options for building unsigned transactions
 * @interface UnsignedTransactionOptions
 */
export interface UnsignedTransactionOptions {
  /** Transaction fee (optional) */
  fee?: string;
  /** Transaction timeout in seconds */
  timeout?: number;
  /** Transaction memo */
  memo?: string;
}

/**
 * Result of building an unsigned transaction
 * @interface UnsignedTransactionResult
 */
export interface UnsignedTransactionResult {
  /** Transaction XDR */
  xdr: string;
  /** Network passphrase used */
  networkPassphrase: string;
  /** Required signers */
  requiredSigners: string[];
  /** Estimated fee */
  estimatedFee: string;
}
