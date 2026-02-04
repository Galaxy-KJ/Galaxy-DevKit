/**
 * @fileoverview Predicate builder utilities for claimable balances
 * @description Provides helper functions to build and validate claim predicates
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
import { ClaimPredicate } from './types.js';
import { ClaimPredicate as StellarClaimPredicate } from '@stellar/stellar-sdk';
/**
 * Creates an unconditional predicate (can claim anytime)
 * @returns ClaimPredicate
 */
export declare function unconditional(): ClaimPredicate;
/**
 * Creates a predicate that must be claimed before an absolute timestamp
 * @param timestamp - ISO timestamp string or Date object
 * @returns ClaimPredicate
 */
export declare function beforeAbsoluteTime(timestamp: string | Date): ClaimPredicate;
/**
 * Creates a predicate that must be claimed within relative time
 * @param seconds - Number of seconds from creation
 * @returns ClaimPredicate
 */
export declare function beforeRelativeTime(seconds: number): ClaimPredicate;
/**
 * Creates a NOT predicate (negation)
 * @param predicate - Predicate to negate
 * @returns ClaimPredicate
 */
export declare function not(predicate: ClaimPredicate): ClaimPredicate;
/**
 * Creates an AND predicate (both conditions must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
export declare function and(predicate1: ClaimPredicate, predicate2: ClaimPredicate): ClaimPredicate;
/**
 * Creates an OR predicate (either condition must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
export declare function or(predicate1: ClaimPredicate, predicate2: ClaimPredicate): ClaimPredicate;
/**
 * Converts our ClaimPredicate type to Stellar SDK ClaimPredicate
 * @param predicate - Our predicate type
 * @returns Stellar SDK ClaimPredicate
 */
export declare function toStellarPredicate(predicate: ClaimPredicate): StellarClaimPredicate;
/**
 * Validates a claim predicate
 * @param predicate - Predicate to validate
 * @throws Error if predicate is invalid
 */
export declare function validatePredicate(predicate: ClaimPredicate): void;
/**
 * Checks if a predicate is currently claimable
 * @param predicate - Predicate to check
 * @param createdAt - Creation timestamp (for relative time predicates)
 * @returns boolean
 */
export declare function isPredicateClaimable(predicate: ClaimPredicate, createdAt?: Date): boolean;
//# sourceMappingURL=predicate-builder.d.ts.map