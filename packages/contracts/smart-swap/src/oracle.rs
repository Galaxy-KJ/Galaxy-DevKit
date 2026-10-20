//! Client for the `price-oracle` / `galaxy-oracle` contracts.
//!
//! The types below are copies of `price-oracle/src/types.rs` with the same
//! names, field order and field types, so they decode the oracle's return
//! value without a crate dependency on it.

use soroban_sdk::{contractclient, contracttype, Address, Env, Symbol};

/// Price scaled by 1_000_000 (six implied decimals).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceEntry {
    pub price: i128,
    pub timestamp: u64,
    pub pusher: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceResult {
    pub entry: PriceEntry,
    pub age_seconds: u64,
    pub is_stale: bool,
}

#[allow(dead_code)]
#[contractclient(name = "OracleClient")]
pub trait Oracle {
    fn get_price_checked(
        env: Env,
        base: Symbol,
        quote: Symbol,
        max_age_seconds: u64,
    ) -> PriceResult;
}
