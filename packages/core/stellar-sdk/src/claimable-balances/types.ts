/**
 * @fileoverview Type definitions for claimable balances
 * @description Contains all interfaces and types related to claimable balance functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Asset } from '@stellar/stellar-sdk';

/**
 * Claimable balance information
 * @interface ClaimableBalance
 */
export interface ClaimableBalance {
  id: string;
  asset: Asset;
  amount: string;
  sponsor?: string;
  claimants: Claimant[];
  lastModified: string;
  lastModifiedLedger: number;
}

/**
 * Claimant configuration
 * @interface Claimant
 */
export interface Claimant {
  destination: string;
  predicate: ClaimPredicate;
}

/**
 * Claim predicate types
 * @type ClaimPredicate
 */
export type ClaimPredicate =
  | { unconditional: true }
  | { not: ClaimPredicate }
  | { or: [ClaimPredicate, ClaimPredicate] }
  | { and: [ClaimPredicate, ClaimPredicate] }
  | { abs_before: string } // ISO timestamp
  | { rel_before: string }; // seconds as string

/**
 * Create claimable balance parameters
 * @interface CreateClaimableBalanceParams
 */
export interface CreateClaimableBalanceParams {
  asset: Asset;
  amount: string;
  claimants: Claimant[];
  memo?: string;
  fee?: number;
}

/**
 * Claim balance parameters
 * @interface ClaimBalanceParams
 */
export interface ClaimBalanceParams {
  balanceId: string;
  memo?: string;
  fee?: number;
}

/**
 * Query claimable balances parameters
 * @interface QueryClaimableBalancesParams
 */
export interface QueryClaimableBalancesParams {
  claimant?: string;
  asset?: Asset;
  sponsor?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Claimable balance result
 * @interface ClaimableBalanceResult
 */
export interface ClaimableBalanceResult {
  balanceId: string;
  hash: string;
  status: string;
  ledger: string;
  createdAt: Date;
}

/**
 * Time-locked balance parameters
 * @interface TimeLockedBalanceParams
 */
export interface TimeLockedBalanceParams {
  asset: Asset;
  amount: string;
  claimant: string;
  unlockDate: Date;
}

/**
 * Vesting schedule parameters
 * @interface VestingScheduleParams
 */
export interface VestingScheduleParams {
  asset: Asset;
  totalAmount: string;
  claimant: string;
  vestingPeriods: Array<{
    date: Date;
    percentage: number;
  }>;
}

/**
 * Multi-party escrow parameters
 * @interface EscrowParams
 */
export interface EscrowParams {
  asset: Asset;
  amount: string;
  parties: string[];
  releaseDate?: Date;
  arbitrator?: string;
}
