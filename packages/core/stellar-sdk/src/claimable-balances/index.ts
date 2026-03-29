/**
 * @fileoverview Claimable balances module exports
 * @description Main entry point for claimable balance functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Export types
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
} from './types.js';

// Export manager
export { ClaimableBalanceManager } from './claimable-balance-manager.js';

// Export predicate builders
export {
  unconditional,
  beforeAbsoluteTime,
  beforeRelativeTime,
  not,
  and,
  or,
  toStellarPredicate,
  validatePredicate,
  isPredicateClaimable,
} from './predicate-builder.js';

// Export helpers
export {
  createTimeLockedBalance,
  createVestingSchedule,
  createEscrow,
  createTwoPartyEscrow,
  createConditionalRelease,
  createRefundableBalance,
} from './helpers.js';
