//! Price Oracle — shared types and error codes
//!
//! All SDK-annotated items live here so that `lib.rs` can stay focused on logic.

use soroban_sdk::{contracterror, contracttype, Address};

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/// Every error the oracle contract can emit.
///
/// Values are stable — do **not** renumber without a migration plan.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OracleError {
    /// Caller is not the admin.
    Unauthorized = 1,
    /// Pusher address is already registered.
    PusherAlreadyExists = 2,
    /// Pusher address is not registered.
    PusherNotFound = 3,
    /// No price record exists for this asset pair.
    PriceNotFound = 4,
    /// Not enough price history to compute TWAP.
    InsufficientHistory = 5,
    /// The contract has already been initialised.
    AlreadyInitialized = 6,
    /// The stored price is older than the caller's accepted staleness window.
    PriceStale = 7,
    /// `price` argument is outside the accepted i128 safe-integer range.
    PriceOutOfRange = 8,
}

// ---------------------------------------------------------------------------
// Core data types
// ---------------------------------------------------------------------------

/// A single price observation for an asset pair.
///
/// ## Precision
/// `price` is scaled by **1 000 000** (six implied decimal places).  
/// Example: 1.234567 XLM/USDC → `price = 1_234_567`.
///
/// ## Overflow note
/// `i128::MAX ≈ 1.7 × 10³⁸`. Even an asset priced at 10³⁰ "whole units"
/// would have a scaled value of 10³⁶, safely within i128.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceEntry {
    /// Price scaled by 1_000_000.
    pub price: i128,
    /// Ledger UNIX timestamp (seconds) when this entry was recorded.
    pub timestamp: u64,
    /// Registered pusher that submitted this observation.
    pub pusher: Address,
}

// ---------------------------------------------------------------------------
// Staleness descriptor
// ---------------------------------------------------------------------------

/// Returned by [`get_price_checked`](crate::PriceOracleContract::get_price_checked).
///
/// Carries both the price data and a staleness flag so callers can make an
/// informed decision without a second round-trip.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceResult {
    /// The most recent price entry for the requested pair.
    pub entry: PriceEntry,
    /// Seconds elapsed since `entry.timestamp` at query time.
    pub age_seconds: u64,
    /// `true` when `age_seconds` exceeds the requested `max_age` threshold.
    pub is_stale: bool,
}
