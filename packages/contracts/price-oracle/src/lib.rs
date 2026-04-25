//! Price Oracle Contract for Galaxy DevKit
//!
//! Stores and serves on-chain price-feed data for any number of asset pairs.
//!
//! ## Access control
//! | Operation            | Who can call        |
//! |----------------------|---------------------|
//! | `initialize`         | anyone (once)       |
//! | `set_admin`          | current admin       |
//! | `add_pusher`         | admin               |
//! | `remove_pusher`      | admin               |
//! | `push_price`         | registered pusher   |
//! | `get_*`              | anyone              |
//!
//! ## Storage layout
//! All state lives in **instance storage** (one ledger entry) which is the
//! cheapest option for frequently-read data.  Each price history vector is
//! bounded to `TWAP_WINDOW_SIZE` entries so storage growth is constant.
//!
//! ## Precision
//! Prices are scaled by **1 000 000** (six implied decimal places).
//! The maximum safe scaled price is `i128::MAX / 1_000_000 ≈ 1.7 × 10³²`,
//! which covers any realistic asset price.  The contract rejects values that
//! would overflow during TWAP arithmetic (`price > MAX_SAFE_PRICE`).

#![no_std]

mod types;
pub use types::{OracleError, PriceEntry, PriceResult};

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, Address, Env, Map, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Symbol keys for instance storage.
const KEY_ADMIN: Symbol = symbol_short!("ADMIN");
const KEY_PUSHERS: Symbol = symbol_short!("PUSHERS");
/// `Map<(Symbol, Symbol), Vec<PriceEntry>>` — rolling TWAP window per pair.
const KEY_PRICES: Symbol = symbol_short!("PRICES");

/// Maximum number of historical observations retained per pair.
/// Older entries are discarded to keep storage bounded.
pub const TWAP_WINDOW_SIZE: u32 = 10;

/// Upper bound on acceptable `price` values.
///
/// 10^30 with 6 decimal places represents an asset priced at 10^24 "whole
/// units" — astronomically above any real-world supply limit.  This constant
/// prevents overflow in the `weighted_sum` computation inside `get_twap`.
pub const MAX_SAFE_PRICE: i128 = 1_000_000_000_000_000_000_000_000_000_000_i128; // 10^30

// ---------------------------------------------------------------------------
// Event topic symbols  (≤ 9 ASCII chars for symbol_short!)
// ---------------------------------------------------------------------------

const EVT_INIT: Symbol = symbol_short!("init");
const EVT_ADMIN: Symbol = symbol_short!("admin");
const EVT_P_ADD: Symbol = symbol_short!("p_add");
const EVT_P_REM: Symbol = symbol_short!("p_rem");
const EVT_PRICE: Symbol = symbol_short!("price");

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct PriceOracleContract;

#[contractimpl]
impl PriceOracleContract {
    // =======================================================================
    // Lifecycle
    // =======================================================================

    /// Initialise the oracle.  Must be called **once** before any other method.
    ///
    /// Emits event: `("init", admin_address)`.
    pub fn initialize(env: &Env, admin: Address) {
        let storage = env.storage().instance();
        if storage.has(&KEY_ADMIN) {
            panic_with_error!(env, OracleError::AlreadyInitialized);
        }
        storage.set(&KEY_ADMIN, &admin);
        let empty_pushers: Vec<Address> = Vec::new(env);
        storage.set(&KEY_PUSHERS, &empty_pushers);
        let empty_prices: Map<(Symbol, Symbol), Vec<PriceEntry>> = Map::new(env);
        storage.set(&KEY_PRICES, &empty_prices);

        env.events().publish((EVT_INIT,), admin);
    }

    /// Return the current admin address.
    pub fn get_admin(env: &Env) -> Address {
        env.storage().instance().get(&KEY_ADMIN).unwrap()
    }

    /// Transfer admin rights to `new_admin`.  Only the current admin may call.
    ///
    /// Emits event: `("admin", new_admin_address)`.
    pub fn set_admin(env: &Env, new_admin: Address) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&KEY_ADMIN).unwrap();
        admin.require_auth();
        storage.set(&KEY_ADMIN, &new_admin);

        env.events().publish((EVT_ADMIN,), new_admin);
    }

    // =======================================================================
    // Pusher management
    // =======================================================================

    /// Register a new price-pusher address.  Only the admin may call.
    ///
    /// Panics with [`OracleError::PusherAlreadyExists`] on duplicate.
    ///
    /// Emits event: `("p_add", pusher_address)`.
    pub fn add_pusher(env: &Env, admin: Address, pusher: Address) {
        let storage = env.storage().instance();
        let stored_admin: Address = storage.get(&KEY_ADMIN).unwrap();
        if stored_admin != admin {
            panic_with_error!(env, OracleError::Unauthorized);
        }
        admin.require_auth();

        let mut pushers: Vec<Address> = storage.get(&KEY_PUSHERS).unwrap_or(Vec::new(env));
        for existing in pushers.iter() {
            if existing == pusher {
                panic_with_error!(env, OracleError::PusherAlreadyExists);
            }
        }
        pushers.push_back(pusher.clone());
        storage.set(&KEY_PUSHERS, &pushers);

        env.events().publish((EVT_P_ADD,), pusher);
    }

    /// Remove a registered pusher.  Only the admin may call.
    ///
    /// Panics with [`OracleError::PusherNotFound`] when pusher is unknown.
    ///
    /// Emits event: `("p_rem", pusher_address)`.
    pub fn remove_pusher(env: &Env, admin: Address, pusher: Address) {
        let storage = env.storage().instance();
        let stored_admin: Address = storage.get(&KEY_ADMIN).unwrap();
        if stored_admin != admin {
            panic_with_error!(env, OracleError::Unauthorized);
        }
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

        env.events().publish((EVT_P_REM,), pusher);
    }

    /// Return all registered pusher addresses.
    pub fn get_pushers(env: &Env) -> Vec<Address> {
        env.storage()
            .instance()
            .get(&KEY_PUSHERS)
            .unwrap_or(Vec::new(env))
    }

    // =======================================================================
    // Price submission
    // =======================================================================

    /// Push a new price observation for the `base`/`quote` pair.
    ///
    /// `price` must be scaled by **1 000 000**.
    ///
    /// # Panics
    /// - [`OracleError::Unauthorized`]    — `pusher` is not registered.
    /// - [`OracleError::PriceOutOfRange`] — `price` ≤ 0 or > `MAX_SAFE_PRICE`.
    ///
    /// Emits event: `("price", (base, quote, price))`.
    pub fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128) {
        pusher.require_auth();
        Self::assert_is_pusher(env, &pusher);

        // Validate price range to prevent i128 overflow in TWAP arithmetic
        if price <= 0 || price > MAX_SAFE_PRICE {
            panic_with_error!(env, OracleError::PriceOutOfRange);
        }

        let storage = env.storage().instance();
        let mut prices: Map<(Symbol, Symbol), Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let key = (base.clone(), quote.clone());
        let mut history: Vec<PriceEntry> = prices.get(key.clone()).unwrap_or(Vec::new(env));

        history.push_back(PriceEntry {
            price,
            timestamp: env.ledger().timestamp(),
            pusher: pusher.clone(),
        });

        // Bound the rolling window by evicting the oldest entry when full
        if history.len() > TWAP_WINDOW_SIZE {
            let mut trimmed: Vec<PriceEntry> = Vec::new(env);
            let start = history.len() - TWAP_WINDOW_SIZE;
            for i in start..history.len() {
                trimmed.push_back(history.get(i).unwrap());
            }
            history = trimmed;
        }

        prices.set(key, history);
        storage.set(&KEY_PRICES, &prices);

        env.events().publish((EVT_PRICE,), (base, quote, price));
    }

    // =======================================================================
    // Price reads — unchecked (no staleness gate)
    // =======================================================================

    /// Return the most recent [`PriceEntry`] for the pair.
    ///
    /// Panics with [`OracleError::PriceNotFound`] when no data exists.
    pub fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry {
        let history = Self::get_price_history(env, base, quote);
        if history.is_empty() {
            panic_with_error!(env, OracleError::PriceNotFound);
        }
        history.get(history.len() - 1).unwrap()
    }

    /// Return the full rolling history (up to `TWAP_WINDOW_SIZE` entries).
    pub fn get_price_history(env: &Env, base: Symbol, quote: Symbol) -> Vec<PriceEntry> {
        let storage = env.storage().instance();
        let prices: Map<(Symbol, Symbol), Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));
        let key = (base, quote);
        prices.get(key).unwrap_or(Vec::new(env))
    }

    // =======================================================================
    // Price reads — staleness-aware
    // =======================================================================

    /// Fetch the latest price annotated with age/staleness metadata.
    ///
    /// Unlike [`get_price`], this call **never panics** on a stale price —
    /// it returns a [`PriceResult`] with `is_stale = true` so callers can
    /// decide how to proceed.
    ///
    /// Panics with [`OracleError::PriceNotFound`] when no data exists at all.
    pub fn get_price_checked(
        env: &Env,
        base: Symbol,
        quote: Symbol,
        max_age_seconds: u64,
    ) -> PriceResult {
        let entry = Self::get_price(env, base, quote);
        let now = env.ledger().timestamp();
        let age = now.saturating_sub(entry.timestamp);
        PriceResult {
            entry,
            age_seconds: age,
            is_stale: age > max_age_seconds,
        }
    }

    /// Like [`get_price_checked`] but **panics** with [`OracleError::PriceStale`]
    /// when the price is older than `max_age_seconds`.
    ///
    /// Use this variant when the caller wants a hard-fail rather than a flag.
    pub fn get_price_strict(
        env: &Env,
        base: Symbol,
        quote: Symbol,
        max_age_seconds: u64,
    ) -> PriceEntry {
        let result = Self::get_price_checked(env, base, quote, max_age_seconds);
        if result.is_stale {
            panic_with_error!(env, OracleError::PriceStale);
        }
        result.entry
    }

    // =======================================================================
    // TWAP
    // =======================================================================

    /// Compute the Time-Weighted Average Price over all stored observations.
    ///
    /// TWAP = Σ(price_i × Δt_i) / Σ(Δt_i)
    ///
    /// where Δt_i is the interval between observation i and the next one (or
    /// the current ledger time for the last entry).
    ///
    /// Panics with [`OracleError::InsufficientHistory`] when fewer than 2
    /// observations are stored.
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
            // All entries share the same timestamp → simple average
            let mut sum: i128 = 0;
            for e in history.iter() {
                sum += e.price;
            }
            return sum / history.len() as i128;
        }

        weighted_sum / total_time
    }

    // =======================================================================
    // Multi-asset helpers
    // =======================================================================

    /// Return the latest prices for **all** registered pairs in a single call.
    ///
    /// The map key is `(base, quote)` pair; value is the most recent
    /// [`PriceEntry`].  Pairs that have no data are omitted.
    pub fn get_all_prices(env: &Env) -> Map<(Symbol, Symbol), PriceEntry> {
        let storage = env.storage().instance();
        let prices: Map<(Symbol, Symbol), Vec<PriceEntry>> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let mut latest: Map<(Symbol, Symbol), PriceEntry> = Map::new(env);
        for (key, history) in prices.iter() {
            if !history.is_empty() {
                let last = history.get(history.len() - 1).unwrap();
                latest.set(key, last);
            }
        }
        latest
    }

    // =======================================================================
    // Internal helpers
    // =======================================================================

    /// Panic with [`OracleError::Unauthorized`] if `caller` is not registered.
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
