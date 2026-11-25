//! Timelock contract: error codes, storage keys and the queued call type.

use soroban_sdk::{contracterror, contracttype, Address, BytesN, Symbol, Val, Vec};

/// Every error the timelock contract can raise.
///
/// Values are stable: do not renumber without a migration plan.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TimelockError {
    /// `initialize` was already called.
    AlreadyInitialized = 1,
    /// A function that needs the admin or delays ran before `initialize`.
    NotInitialized = 2,
    /// `min_delay` is zero or above `MAXIMUM_DELAY`.
    InvalidDelay = 3,
    /// `grace_period` is zero or above `MAXIMUM_GRACE_PERIOD`.
    InvalidGracePeriod = 4,
    /// `eta` is earlier than `now + min_delay`.
    EtaTooEarly = 5,
    /// `eta` is later than `now + MAXIMUM_DELAY`.
    EtaTooLate = 6,
    /// The same call (target, function, args, eta) is already queued.
    AlreadyQueued = 7,
    /// No queued transaction has this hash.
    NotQueued = 8,
    /// The transaction was already executed.
    AlreadyExecuted = 9,
    /// The ledger time is still before `eta`.
    NotReady = 10,
    /// The ledger time is past `eta + grace_period`.
    Expired = 11,
    /// A time computation overflowed `u64`.
    TimeOverflow = 12,
}

/// Storage keys.
///
/// `Admin`, `MinDelay` and `GracePeriod` live in instance storage. Each queued
/// transaction and each executed marker is its own persistent entry, so the
/// instance does not grow with the number of transactions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Address allowed to queue, execute and cancel transactions.
    Admin,
    /// Minimum number of seconds between queueing and `eta`.
    MinDelay,
    /// Seconds after `eta` during which the transaction can still be executed.
    GracePeriod,
    /// A queued (not yet executed or cancelled) transaction.
    Queued(BytesN<32>),
    /// Marker for a transaction that was executed.
    Executed(BytesN<32>),
}

/// A contract call waiting in the timelock.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueuedTransaction {
    /// Contract to call.
    pub target: Address,
    /// Function to call on `target`.
    pub fn_name: Symbol,
    /// Arguments passed to `fn_name`.
    pub args: Vec<Val>,
    /// Earliest ledger timestamp at which the call can run.
    pub eta: u64,
    /// Ledger timestamp at which the call was queued.
    pub queued_at: u64,
}
