/**
 * @fileoverview Predicate builder utilities for claimable balances
 * @description Provides helper functions to build and validate claim predicates
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { ClaimPredicate } from './types.js';
import { Claimant, xdr } from '@stellar/stellar-sdk';

/**
 * Creates an unconditional predicate (can claim anytime)
 * @returns ClaimPredicate
 */
export function unconditional(): ClaimPredicate {
  return { unconditional: true };
}

/**
 * Creates a predicate that must be claimed before an absolute timestamp
 * @param timestamp - ISO timestamp string or Date object
 * @returns ClaimPredicate
 */
export function beforeAbsoluteTime(timestamp: string | Date): ClaimPredicate {
  const isoString =
    timestamp instanceof Date ? timestamp.toISOString() : timestamp;
  return { abs_before: isoString };
}

/**
 * Creates a predicate that must be claimed within relative time
 * @param seconds - Number of seconds from creation
 * @returns ClaimPredicate
 */
export function beforeRelativeTime(seconds: number): ClaimPredicate {
  return { rel_before: seconds.toString() };
}

/**
 * Creates a NOT predicate (negation)
 * @param predicate - Predicate to negate
 * @returns ClaimPredicate
 */
export function not(predicate: ClaimPredicate): ClaimPredicate {
  return { not: predicate };
}

/**
 * Creates an AND predicate (both conditions must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
export function and(
  predicate1: ClaimPredicate,
  predicate2: ClaimPredicate
): ClaimPredicate {
  return { and: [predicate1, predicate2] };
}

/**
 * Creates an OR predicate (either condition must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
export function or(
  predicate1: ClaimPredicate,
  predicate2: ClaimPredicate
): ClaimPredicate {
  return { or: [predicate1, predicate2] };
}

/**
 * Converts our ClaimPredicate type to Stellar SDK ClaimPredicate
 * @param predicate - Our predicate type
 * @returns Stellar SDK xdr.ClaimPredicate
 */
export function toStellarPredicate(
  predicate: ClaimPredicate
): xdr.ClaimPredicate {
  if ('unconditional' in predicate) {
    return Claimant.predicateUnconditional();
  }

  if ('not' in predicate) {
    return Claimant.predicateNot(toStellarPredicate(predicate.not));
  }

  if ('and' in predicate) {
    return Claimant.predicateAnd(
      toStellarPredicate(predicate.and[0]),
      toStellarPredicate(predicate.and[1]),
    );
  }

  if ('or' in predicate) {
    return Claimant.predicateOr(
      toStellarPredicate(predicate.or[0]),
      toStellarPredicate(predicate.or[1]),
    );
  }

  if ('abs_before' in predicate) {
    const timestamp = Math.floor(new Date(predicate.abs_before).getTime() / 1000).toString();
    return Claimant.predicateBeforeAbsoluteTime(timestamp);
  }

  if ('rel_before' in predicate) {
    return Claimant.predicateBeforeRelativeTime(predicate.rel_before);
  }

  throw new Error('Invalid predicate type');
}

/**
 * Validates a claim predicate
 * @param predicate - Predicate to validate
 * @throws Error if predicate is invalid
 */
export function validatePredicate(predicate: ClaimPredicate): void {
  if ('unconditional' in predicate) {
    return; // Valid
  }

  if ('not' in predicate) {
    validatePredicate(predicate.not);
    return;
  }

  if ('and' in predicate) {
    if (!Array.isArray(predicate.and) || predicate.and.length !== 2) {
      throw new Error('AND predicate must have exactly 2 sub-predicates');
    }
    validatePredicate(predicate.and[0]);
    validatePredicate(predicate.and[1]);
    return;
  }

  if ('or' in predicate) {
    if (!Array.isArray(predicate.or) || predicate.or.length !== 2) {
      throw new Error('OR predicate must have exactly 2 sub-predicates');
    }
    validatePredicate(predicate.or[0]);
    validatePredicate(predicate.or[1]);
    return;
  }

  if ('abs_before' in predicate) {
    const date = new Date(predicate.abs_before);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid absolute timestamp format');
    }
    if (date.getTime() < Date.now()) {
      throw new Error('Absolute timestamp must be in the future');
    }
    return;
  }

  if ('rel_before' in predicate) {
    const seconds = parseInt(predicate.rel_before, 10);
    if (isNaN(seconds) || seconds <= 0) {
      throw new Error('Relative time must be a positive number of seconds');
    }
    return;
  }

  throw new Error('Unknown predicate type');
}

/**
 * Checks if a predicate is currently claimable
 * @param predicate - Predicate to check
 * @param createdAt - Creation timestamp (for relative time predicates)
 * @returns boolean
 */
export function isPredicateClaimable(
  predicate: ClaimPredicate,
  createdAt?: Date
): boolean {
  if ('unconditional' in predicate) {
    return true;
  }

  if ('not' in predicate) {
    return !isPredicateClaimable(predicate.not, createdAt);
  }

  if ('and' in predicate) {
    return (
      isPredicateClaimable(predicate.and[0], createdAt) &&
      isPredicateClaimable(predicate.and[1], createdAt)
    );
  }

  if ('or' in predicate) {
    return (
      isPredicateClaimable(predicate.or[0], createdAt) ||
      isPredicateClaimable(predicate.or[1], createdAt)
    );
  }

  if ('abs_before' in predicate) {
    const deadline = new Date(predicate.abs_before).getTime();
    return Date.now() < deadline;
  }

  if ('rel_before' in predicate) {
    if (!createdAt) {
      return true; // Can't validate without creation time
    }
    const seconds = parseInt(predicate.rel_before, 10);
    const deadline = createdAt.getTime() + seconds * 1000;
    return Date.now() < deadline;
  }

  return false;
}
