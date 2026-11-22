//! Vesting contract: error codes, storage keys and the schedule type.

use soroban_sdk::{contracterror, contracttype, Address};

/// Every error the vesting contract can raise.
///
/// Values are stable: do not renumber without a migration plan.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VestingError {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// A function that needs the admin or token ran before `initialize`.
    NotInitialized = 2,
    /// `total_amount` is zero or negative.
    InvalidAmount = 3,
    /// `duration` is zero.
    InvalidDuration = 4,
    /// `cliff` is longer than `duration`.
    CliffExceedsDuration = 5,
    /// `start + duration` does not fit in a `u64`.
    TimeOverflow = 6,
    /// The beneficiary already has a schedule.
    ScheduleExists = 7,
    /// The beneficiary has no schedule.
    ScheduleNotFound = 8,
    /// The cliff (`start + cliff`) has not been reached yet.
    CliffNotReached = 9,
    /// Nothing new has vested since the last claim.
    NothingToClaim = 10,
    /// Vesting math overflowed. Unreachable for schedules accepted by
    /// `create_schedule`; kept as a defensive guard.
    MathOverflow = 11,
    /// The beneficiary is the vesting contract itself, which could never claim.
    InvalidBeneficiary = 12,
    /// The schedule was already revoked.
    AlreadyRevoked = 13,
    /// The funder has no deferred refund to withdraw.
    NothingToWithdraw = 14,
}

/// Storage keys.
///
/// `Admin` and `Token` live in instance storage. Each `Schedule` is its own
/// persistent entry, so schedules do not share size or TTL.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Address allowed to revoke schedules.
    Admin,
    /// SEP-41 token (or Stellar Asset Contract) held and paid out by the contract.
    Token,
    /// The vesting schedule of one beneficiary.
    Schedule(Address),
    /// Refund owed to a funder whose automatic refund on revoke failed.
    Refund(Address),
}

/// A funded vesting schedule.
///
/// Tokens vest linearly from `start` to `start + duration`. Nothing can be
/// claimed before `start + cliff`; at the cliff, everything vested since
/// `start` becomes claimable at once.
///
/// After a revoke, `total_amount` is lowered to what had vested at that
/// moment and `revoked` is set, so the beneficiary can still claim it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingSchedule {
    /// Account that deposited `total_amount` and receives unvested tokens on revoke.
    pub funder: Address,
    /// Account that can claim the vested tokens.
    pub beneficiary: Address,
    /// Tokens deposited for this schedule, in token base units.
    pub total_amount: i128,
    /// Tokens already paid to the beneficiary.
    pub claimed: i128,
    /// Ledger timestamp (seconds) when vesting begins. May be in the past.
    pub start: u64,
    /// Seconds after `start` before anything can be claimed. `cliff <= duration`.
    pub cliff: u64,
    /// Seconds after `start` until everything has vested. Must be `> 0`.
    pub duration: u64,
    /// Set by `revoke_schedule`. A revoked schedule is fully vested at its
    /// reduced `total_amount`.
    pub revoked: bool,
}
