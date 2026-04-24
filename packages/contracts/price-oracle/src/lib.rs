//! Price Oracle Contract for Galaxy DevKit
//!
//! This contract stores on-chain price data for asset pairs submitted by
//! authorised price-pushers. It exposes a TWAP (Time-Weighted Average Price)
//! to protect consumers from single-block price manipulation.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, symbol_short, vec, Address, Env,
    Error as SdkError, Map, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OracleError {
    /// Caller is not the admin
    Unauthorized = 1,
    /// Pusher address is already registered
    PusherAlreadyExists = 2,
    /// Pusher address is not registered
    PusherNotFound = 3,
    /// No price record exists for this asset pair
    PriceNotFound = 4,
    /// Not enough price history to compute TWAP
    InsufficientHistory = 5,
    /// The contract has already been initialised
    AlreadyInitialized = 6,
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Represents a single price observation for an asset pair.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceEntry {
    /// Price scaled by 1_000_000 (i.e. 7 decimal places).
    /// Example: 1.234567 XLM/USDC → 1_234_567
    pub price: i128,
    /// Ledger timestamp when this entry was recorded
    pub timestamp: u64,
    /// Address of the pusher that submitted this price
    pub pusher: Address,
}

/// Canonical key used to look up prices: `BASE_QUOTE` (e.g. `XLM_USDC`).
/// We store it as a Symbol so it fits in the cheap instance storage slot.
fn pair_key(env: &Env, base: &Symbol, quote: &Symbol) -> Symbol {
    // Concatenate base + "_" + quote into a single short symbol.
    // Symbol::short only accepts up to 9 chars; for longer pair keys we fall
    // back to a 32-byte hash stored as a Symbol.
    let mut key_str = base.to_string();
    key_str.push('_');
    key_str.push_str(&quote.to_string());
    // Soroban does not expose arbitrary-length Symbol construction without
    // `String`; we store the pair key as a concatenated symbol via the SDK's
    // from_str helper (available in soroban-sdk 21+).
    Symbol::new(env, &key_str)
}

// ---------------------------------------------------------------------------
// Storage key constants  (instance storage — all fit in one ledger entry)
// ---------------------------------------------------------------------------

const KEY_ADMIN: Symbol = symbol_short!("ADMIN");
const KEY_PUSHERS: Symbol = symbol_short!("PUSHERS");
/// Map<PairKey, Vec<PriceEntry>> — rolling window of the last N observations
const KEY_PRICES: Symbol = symbol_short!("PRICES");
/// Maximum number of historical price entries stored per pair (TWAP window)
const TWAP_WINDOW_SIZE: u32 = 10;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PriceOracleContract;

#[contractimpl]
impl PriceOracleContract {
    // -----------------------------------------------------------------------
    // Admin & lifecycle
    // -----------------------------------------------------------------------

    /// Initialise the oracle with an admin address.
    /// Can only be called once.
    pub fn initialize(env: &Env, admin: Address) {
        let storage = env.storage().instance();
        if storage.has(&KEY_ADMIN) {
            panic_with_error!(env, OracleError::AlreadyInitialized);
        }
        storage.set(&KEY_ADMIN, &admin);
        // Initialise empty pusher list and price map
        let empty_pushers: Vec<Address> = Vec::new(env);
        storage.set(&KEY_PUSHERS, &empty_pushers);
        let empty_prices: Map<Symbol, Vec<PriceEntry>> = Map::new(env);
        storage.set(&KEY_PRICES, &empty_prices);
    }

    /// Return the current admin address.
    pub fn get_admin(env: &Env) -> Address {
        env.storage().instance().get(&KEY_ADMIN).unwrap()
    }

    /// Transfer admin rights to a new address.
    /// Only the current admin may call this.
    pub fn set_admin(env: &Env, new_admin: Address) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&KEY_ADMIN).unwrap();
        admin.require_auth();
        storage.set(&KEY_ADMIN, &new_admin);
    }

    // -----------------------------------------------------------------------
    // Pusher management (access control)
    // -----------------------------------------------------------------------

    /// Register a new price-pusher address.
    /// Only the admin may call this.
    pub fn add_pusher(env: &Env, pusher: Address) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&KEY_ADMIN).unwrap();
        admin.require_auth();

        let mut pushers: Vec<Address> = storage.get(&KEY_PUSHERS).unwrap_or(Vec::new(env));

        // Check for duplicates
        for existing in pushers.iter() {
            if existing == pusher {
                panic_with_error!(env, OracleError::PusherAlreadyExists);
            }
        }

        pushers.push_back(pusher);
        storage.set(&KEY_PUSHERS, &pushers);
    }

    /// Remove a price-pusher address.
    /// Only the admin may call this.
    pub fn remove_pusher(env: &Env, pusher: Address) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&KEY_ADMIN).unwrap();
        admin.require_auth();

        let pushers: Vec<Address> = storage.get(&KEY_PUSHERS).unwrap_or(Vec::new(env));
        let mut new_pushers: Vec<Address> = Vec::new(env);
        let mut found = false;

        for existing in pushers.iter() {
            if existing == pusher {
                found = true;
            } else {
                new_pushers.push_back(existing);
            }
        }

        if !found {
            panic_with_error!(env, OracleError::PusherNotFound);
        }

        storage.set(&KEY_PUSHERS, &new_pushers);
    }

    /// Return all registered pusher addresses.
    pub fn get_pushers(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&KEY_PUSHERS)
            .unwrap_or(Vec::new(env))
    }

    // -----------------------------------------------------------------------
    // Price submission
    // -----------------------------------------------------------------------

    /// Push a new price for the `base`/`quote` asset pair.
    ///
    /// `price` must be scaled by 1_000_000 (7 implied decimal places).
    /// Example: to submit 1.2345678 XLM/USDC pass `price = 1_234_568`.
    ///
    /// Only a registered pusher may call this; the SDK enforces the auth
    /// via `pusher.require_auth()`.
    pub fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128) {
        pusher.require_auth();

        // Verify pusher is in the authorised list
        Self::assert_is_pusher(env, &pusher);

        let storage = env.storage().instance();
        let mut prices: Map<Symbol, Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let key = pair_key(env, &base, &quote);
        let mut history: Vec<PriceEntry> = prices.get(key.clone()).unwrap_or(Vec::new(env));

        let entry = PriceEntry {
            price,
            timestamp: env.ledger().timestamp(),
            pusher,
        };
        history.push_back(entry);

        // Keep only the last TWAP_WINDOW_SIZE entries to bound storage growth
        if history.len() > TWAP_WINDOW_SIZE {
            // Remove oldest (index 0)
            let mut trimmed: Vec<PriceEntry> = Vec::new(env);
            let start = history.len() - TWAP_WINDOW_SIZE;
            for i in start..history.len() {
                trimmed.push_back(history.get(i).unwrap());
            }
            history = trimmed;
        }

        prices.set(key, history);
        storage.set(&KEY_PRICES, &prices);
    }

    // -----------------------------------------------------------------------
    // Price reads
    // -----------------------------------------------------------------------

    /// Return the most recent price entry for a pair.
    pub fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry {
        let storage = env.storage().instance();
        let prices: Map<Symbol, Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let key = pair_key(env, &base, &quote);
        let history: Vec<PriceEntry> = prices.get(key).unwrap_or(Vec::new(env));

        if history.is_empty() {
            panic_with_error!(env, OracleError::PriceNotFound);
        }

        history.get(history.len() - 1).unwrap()
    }

    /// Return the full price history (up to `TWAP_WINDOW_SIZE` entries) for a pair.
    pub fn get_price_history(env: &Env, base: Symbol, quote: Symbol) -> Vec<PriceEntry> {
        let storage = env.storage().instance();
        let prices: Map<Symbol, Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let key = pair_key(env, &base, &quote);
        prices.get(key).unwrap_or(Vec::new(env))
    }

    /// Compute the Time-Weighted Average Price (TWAP) over all stored
    /// observations for the given pair.
    ///
    /// TWAP = Σ(price_i × Δt_i) / Σ(Δt_i)
    ///
    /// where Δt_i is the interval between consecutive timestamps.
    /// For the most recent entry Δt = current_ledger_time − last_timestamp.
    ///
    /// Panics with `InsufficientHistory` when fewer than 2 entries exist.
    pub fn get_twap(env: &Env, base: Symbol, quote: Symbol) -> i128 {
        let history = Self::get_price_history(env, base, quote);

        if history.len() < 2 {
            panic_with_error!(env, OracleError::InsufficientHistory);
        }

        let now = env.ledger().timestamp();
        let mut weighted_sum: i128 = 0;
        let mut total_time: i128 = 0;

        for i in 0..history.len() {
            let entry = history.get(i).unwrap();
            // Determine the duration this price was "active"
            let end_time: u64 = if i + 1 < history.len() {
                history.get(i + 1).unwrap().timestamp
            } else {
                now
            };

            let duration = end_time.saturating_sub(entry.timestamp) as i128;
            weighted_sum += entry.price * duration;
            total_time += duration;
        }

        if total_time == 0 {
            // All entries share the same timestamp; return simple average
            let sum: i128 = history.iter().map(|e| e.price).sum();
            return sum / history.len() as i128;
        }

        weighted_sum / total_time
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Panic with `Unauthorized` if `caller` is not a registered pusher.
    fn assert_is_pusher(env: &Env, caller: &Address) {
        let pushers: Vec<Address> = env
            .storage()
            .instance()
            .get(&KEY_PUSHERS)
            .unwrap_or(Vec::new(env));

        for pusher in pushers.iter() {
            if pusher == *caller {
                return;
            }
        }
        panic_with_error!(env, OracleError::Unauthorized);
    }
}

#[cfg(test)]
mod test;
