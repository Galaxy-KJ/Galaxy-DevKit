"use strict";
/**
 * @fileoverview Predicate builder utilities for claimable balances
 * @description Provides helper functions to build and validate claim predicates
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.unconditional = unconditional;
exports.beforeAbsoluteTime = beforeAbsoluteTime;
exports.beforeRelativeTime = beforeRelativeTime;
exports.not = not;
exports.and = and;
exports.or = or;
exports.toStellarPredicate = toStellarPredicate;
exports.validatePredicate = validatePredicate;
exports.isPredicateClaimable = isPredicateClaimable;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
/**
 * Creates an unconditional predicate (can claim anytime)
 * @returns ClaimPredicate
 */
function unconditional() {
    return { unconditional: true };
}
/**
 * Creates a predicate that must be claimed before an absolute timestamp
 * @param timestamp - ISO timestamp string or Date object
 * @returns ClaimPredicate
 */
function beforeAbsoluteTime(timestamp) {
    const isoString = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
    return { abs_before: isoString };
}
/**
 * Creates a predicate that must be claimed within relative time
 * @param seconds - Number of seconds from creation
 * @returns ClaimPredicate
 */
function beforeRelativeTime(seconds) {
    return { rel_before: seconds.toString() };
}
/**
 * Creates a NOT predicate (negation)
 * @param predicate - Predicate to negate
 * @returns ClaimPredicate
 */
function not(predicate) {
    return { not: predicate };
}
/**
 * Creates an AND predicate (both conditions must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
function and(predicate1, predicate2) {
    return { and: [predicate1, predicate2] };
}
/**
 * Creates an OR predicate (either condition must be true)
 * @param predicate1 - First predicate
 * @param predicate2 - Second predicate
 * @returns ClaimPredicate
 */
function or(predicate1, predicate2) {
    return { or: [predicate1, predicate2] };
}
/**
 * Converts our ClaimPredicate type to Stellar SDK ClaimPredicate
 * @param predicate - Our predicate type
 * @returns Stellar SDK ClaimPredicate
 */
function toStellarPredicate(predicate) {
    if ('unconditional' in predicate) {
        return stellar_sdk_1.ClaimPredicate.predicateUnconditional();
    }
    if ('not' in predicate) {
        return stellar_sdk_1.ClaimPredicate.predicateNot(toStellarPredicate(predicate.not));
    }
    if ('and' in predicate) {
        return stellar_sdk_1.ClaimPredicate.predicateAnd([
            toStellarPredicate(predicate.and[0]),
            toStellarPredicate(predicate.and[1]),
        ]);
    }
    if ('or' in predicate) {
        return stellar_sdk_1.ClaimPredicate.predicateOr([
            toStellarPredicate(predicate.or[0]),
            toStellarPredicate(predicate.or[1]),
        ]);
    }
    if ('abs_before' in predicate) {
        const timestamp = Math.floor(new Date(predicate.abs_before).getTime() / 1000);
        return stellar_sdk_1.ClaimPredicate.predicateBeforeAbsoluteTime(timestamp.toString());
    }
    if ('rel_before' in predicate) {
        return stellar_sdk_1.ClaimPredicate.predicateBeforeRelativeTime(predicate.rel_before);
    }
    throw new Error('Invalid predicate type');
}
/**
 * Validates a claim predicate
 * @param predicate - Predicate to validate
 * @throws Error if predicate is invalid
 */
function validatePredicate(predicate) {
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
function isPredicateClaimable(predicate, createdAt) {
    if ('unconditional' in predicate) {
        return true;
    }
    if ('not' in predicate) {
        return !isPredicateClaimable(predicate.not, createdAt);
    }
    if ('and' in predicate) {
        return (isPredicateClaimable(predicate.and[0], createdAt) &&
            isPredicateClaimable(predicate.and[1], createdAt));
    }
    if ('or' in predicate) {
        return (isPredicateClaimable(predicate.or[0], createdAt) ||
            isPredicateClaimable(predicate.or[1], createdAt));
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
//# sourceMappingURL=predicate-builder.js.map