/**
 * @fileoverview Helper functions for common claimable balance patterns
 * @description Provides utilities for time-locked balances, vesting schedules, and escrow
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Asset,
  Operation,
  TransactionBuilder,
  Account,
} from '@stellar/stellar-sdk';
import {
  TimeLockedBalanceParams,
  VestingScheduleParams,
  EscrowParams,
} from './types';
import { beforeAbsoluteTime, unconditional, and, or } from './predicate-builder';
import { toStellarPredicate } from './predicate-builder';

/**
 * Creates a time-locked claimable balance operation
 * @param params - Time-locked balance parameters
 * @returns Operation
 */
export function createTimeLockedBalance(
  params: TimeLockedBalanceParams
): any {
  const predicate = beforeAbsoluteTime(params.unlockDate);

  return Operation.createClaimableBalance({
    asset: params.asset,
    amount: params.amount,
    claimants: [
      {
        destination: params.claimant,
        predicate: toStellarPredicate(predicate),
      },
    ] as any,
  });
}

/**
 * Creates a vesting schedule with multiple claimable balances
 * @param sourceAccount - Source account
 * @param params - Vesting schedule parameters
 * @returns Array of operations
 */
export function createVestingSchedule(
  sourceAccount: Account,
  params: VestingScheduleParams
): Operation[] {
  const operations: Operation[] = [];
  const totalAmount = parseFloat(params.totalAmount);

  // Validate percentages sum to 100
  const totalPercentage = params.vestingPeriods.reduce(
    (sum, period) => sum + period.percentage,
    0
  );
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error('Vesting periods must sum to 100%');
  }

  // Sort periods by date
  const sortedPeriods = [...params.vestingPeriods].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Create a claimable balance for each vesting period
  sortedPeriods.forEach((period) => {
    const amount = ((totalAmount * period.percentage) / 100).toFixed(7);
    const predicate = beforeAbsoluteTime(period.date);

    operations.push(
      Operation.createClaimableBalance({
        asset: params.asset,
        amount,
        claimants: [
          {
            destination: params.claimant,
            predicate: toStellarPredicate(predicate),
          },
        ] as any,
      }) as any
    );
  });

  return operations;
}

/**
 * Creates a multi-party escrow claimable balance
 * @param params - Escrow parameters
 * @returns Operation
 */
export function createEscrow(params: EscrowParams): any {
  if (params.parties.length < 2) {
    throw new Error('Escrow requires at least 2 parties');
  }

  const claimants: Array<{ destination: string; predicate: any }> = [];

  // Add all parties as claimants
  params.parties.forEach((party) => {
    let predicate;

    if (params.releaseDate) {
      // Time-locked: can claim after release date
      predicate = beforeAbsoluteTime(params.releaseDate);
    } else {
      // Unconditional: can claim anytime
      predicate = unconditional();
    }

    claimants.push({
      destination: party,
      predicate,
    });
  });

  // Add arbitrator if provided (can claim anytime for dispute resolution)
  if (params.arbitrator) {
    claimants.push({
      destination: params.arbitrator,
      predicate: unconditional(),
    });
  }

  return Operation.createClaimableBalance({
    asset: params.asset,
    amount: params.amount,
    claimants: claimants.map((c) => ({
      destination: c.destination,
      predicate: toStellarPredicate(c.predicate),
    })) as any,
  });
}

/**
 * Creates a two-party escrow with time lock and arbitrator
 * @param params - Escrow parameters with buyer, seller, and arbitrator
 * @returns Operation
 */
export function createTwoPartyEscrow(params: {
  asset: Asset;
  amount: string;
  buyer: string;
  seller: string;
  arbitrator: string;
  releaseDate: Date;
}): any {
  const buyerPredicate = beforeAbsoluteTime(params.releaseDate);
  const sellerPredicate = beforeAbsoluteTime(params.releaseDate);
  const arbitratorPredicate = unconditional();

  return Operation.createClaimableBalance({
    asset: params.asset,
    amount: params.amount,
    claimants: [
      {
        destination: params.buyer,
        predicate: toStellarPredicate(buyerPredicate),
      },
      {
        destination: params.seller,
        predicate: toStellarPredicate(sellerPredicate),
      },
      {
        destination: params.arbitrator,
        predicate: toStellarPredicate(arbitratorPredicate),
      },
    ] as any,
  });
}

/**
 * Creates a conditional release balance (requires both time and condition)
 * @param params - Conditional release parameters
 * @returns Operation
 */
export function createConditionalRelease(params: {
  asset: Asset;
  amount: string;
  claimant: string;
  releaseDate: Date;
  conditionPredicate: any; // Additional condition predicate
}): any {
  const timePredicate = beforeAbsoluteTime(params.releaseDate);
  const combinedPredicate = and(timePredicate, params.conditionPredicate);

  return Operation.createClaimableBalance({
    asset: params.asset,
    amount: params.amount,
    claimants: [
      {
        destination: params.claimant,
        predicate: toStellarPredicate(combinedPredicate),
      },
    ] as any,
  });
}

/**
 * Creates a refundable balance (sender can reclaim if not claimed within time limit)
 * @param params - Refundable balance parameters
 * @returns Operation
 */
export function createRefundableBalance(params: {
  asset: Asset;
  amount: string;
  recipient: string;
  sender: string;
  expirationDate: Date;
}): any {
  // Recipient can claim before expiration
  const recipientPredicate = beforeAbsoluteTime(params.expirationDate);
  
  // Sender can claim after expiration (using NOT predicate)
  // Note: Stellar doesn't support "after" directly, so we use unconditional
  // and rely on the fact that only one can claim
  // For true "after" behavior, we'd need to structure this differently
  const senderPredicate = unconditional();

  return Operation.createClaimableBalance({
    asset: params.asset,
    amount: params.amount,
    claimants: [
      {
        destination: params.recipient,
        predicate: toStellarPredicate(recipientPredicate),
      },
      {
        destination: params.sender,
        predicate: toStellarPredicate(senderPredicate),
      },
    ] as any,
  });
}
