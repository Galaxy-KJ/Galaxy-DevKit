//! Shared types, storage keys, and error codes for the security-limits contract.
//!
//! Error discriminants are ABI. Do not renumber them.

use soroban_sdk::{contracterror, contracttype, Address, Symbol, Vec};

/// TTL constants in ledgers (~5s each, 17_280 per day).
pub const DAY_IN_LEDGERS: u32 = 17_280;
/// Extend when remaining TTL drops below ~30 days.
pub const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
/// Extend persistent and instance entries out to ~120 days.
pub const TTL_EXTEND: u32 = 120 * DAY_IN_LEDGERS;

/// 24h window used by risk-profile daily volume, in seconds.
pub const DAILY_WINDOW_SECS: u64 = 86_400;

/// Typed errors returned by mutating entry points.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SecurityLimitsError {
    /// Caller did not authorize, or is neither the owner nor the enforcer.
    NotAuthorized = 1,
    /// No limit exists for the given owner + id.
    LimitNotFound = 2,
    /// The transaction would exceed a configured limit.
    LimitExceeded = 3,
    /// Asset is blacklisted or missing from a non-empty allow list.
    AssetNotAllowed = 4,
    /// `initialize` was already called.
    AlreadyInitialized = 5,
    /// Amount or max_amount is zero, or a windowed limit has a zero window.
    InvalidAmount = 6,
    /// Usage accumulation overflowed `u64`.
    Overflow = 7,
}

/// A single owner-scoped spending limit.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecurityLimit {
    pub id: u64,
    pub owner: Address,
    pub limit_type: LimitType,
    pub asset: Symbol,
    pub max_amount: u64,
    pub time_window: u64,
    pub current_usage: u64,
    pub last_reset: u64,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LimitType {
    Daily,
    Weekly,
    Monthly,
    PerTransaction,
    PerHour,
    Custom(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskProfile {
    pub owner: Address,
    pub risk_level: RiskLevel,
    pub max_daily_volume: u64,
    pub max_single_transaction: u64,
    pub allowed_assets: Vec<Symbol>,
    pub blacklisted_assets: Vec<Symbol>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Restricted,
}

/// Rolling usage counter stored under [`DataKey::Usage`].
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Usage {
    pub amount: u64,
    pub last_reset: u64,
}

/// Read-only result of [`crate::SecurityLimitsContract::check_transaction_allowed`].
///
/// `reason` is `None` when `allowed` is true. Otherwise it is the
/// [`SecurityLimitsError`] discriminant (`LimitExceeded`, `AssetNotAllowed`,
/// `Overflow`).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CheckResult {
    pub allowed: bool,
    pub reason: Option<u32>,
}

impl CheckResult {
    pub fn ok() -> Self {
        Self {
            allowed: true,
            reason: None,
        }
    }

    pub fn denied(err: SecurityLimitsError) -> Self {
        Self {
            allowed: false,
            reason: Some(err as u32),
        }
    }
}

/// Persistent keys are per-owner. Instance keys hold only admin, enforcer, and counters.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Enforcer,
    NextLimitId,
    NextTxId,
    /// Map of `limit_id -> SecurityLimit` for one owner.
    Limits(Address),
    Profile(Address),
    /// Rolling usage for `(owner, asset)`. The reserved asset symbol `DAILYVOL`
    /// holds the risk-profile 24h volume.
    Usage(Address, Symbol),
}
