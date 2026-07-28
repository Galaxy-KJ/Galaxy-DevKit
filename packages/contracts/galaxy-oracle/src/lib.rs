//! Galaxy Oracle Contract for Galaxy DevKit
//!
//! Stores and serves on-chain price-feed data for asset pairs.
//!
//! ## Access control
//! | Operation            | Who can call        |
//! |----------------------|---------------------|
//! | `initialize`         | anyone (once)       |
//! | `set_admin`          | current admin       |
//! | `add_pusher`         | admin               |
//! | `remove_pusher`      | admin               |
//! | `push_price`         | registered pusher   |
//! | `get_price`          | anyone              |
//! | `get_*`              | anyone              |

#![no_std]

mod twap;
mod types;
pub use types::{OracleError, PriceEntry, PriceResult};
use twap::{compute_twap, compute_twap_window};
use types::PriceRingBuffer;

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, Address, Env, Map, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Symbol keys for instance storage.
const KEY_ADMIN: Symbol = symbol_short!("ADMIN");
const KEY_PUSHERS: Symbol = symbol_short!("PUSHERS");
/// `Map<(Symbol, Symbol), PriceRingBuffer>` — rolling TWAP window per pair.
const KEY_PRICES: Symbol = symbol_short!("PRICES");

/// Maximum number of historical observations retained per pair.
pub const TWAP_WINDOW_SIZE: u32 = 10;

/// Upper bound on acceptable `price` values (10^30 with 6 decimal places).
pub const MAX_SAFE_PRICE: i128 = 1_000_000_000_000_000_000_000_000_000_000_i128;

pub const WINDOW_5M: u64 = 300;
pub const WINDOW_15M: u64 = 900;
pub const WINDOW_1H: u64 = 3600;

// ---------------------------------------------------------------------------
// Event topic symbols
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
pub struct GalaxyOracleContract;

#[contractimpl]
impl GalaxyOracleContract {
    // =======================================================================
    // Lifecycle
    // =======================================================================

    /// Initialise the oracle. Must be called **once** before any other method.
    pub fn initialize(env: &Env, admin: Address) {
        let storage = env.storage().instance();
        if storage.has(&KEY_ADMIN) {
            panic_with_error!(env, OracleError::AlreadyInitialized);
        }
        storage.set(&KEY_ADMIN, &admin);
        let empty_pushers: Vec<Address> = Vec::new(env);
        storage.set(&KEY_PUSHERS, &empty_pushers);
        let empty_prices: Map<(Symbol, Symbol), PriceRingBuffer> = Map::new(env);
        storage.set(&KEY_PRICES, &empty_prices);

        env.events().publish((EVT_INIT,), admin);
    }

    /// Return the current admin address.
    pub fn get_admin(env: &Env) -> Address {
        env.storage().instance().get(&KEY_ADMIN).unwrap()
    }

    /// Transfer admin rights to `new_admin`. Only the current admin may call.
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

    /// Register a new price-pusher address. Only the admin may call.
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

    /// Remove a registered pusher. Only the admin may call.
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
    /// `price` must be scaled by 1,000,000.
    pub fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128) {
        pusher.require_auth();
        Self::assert_is_pusher(env, &pusher);

        if price <= 0 || price > MAX_SAFE_PRICE {
            panic_with_error!(env, OracleError::PriceOutOfRange);
        }

        let storage = env.storage().instance();
        let mut prices: Map<(Symbol, Symbol), PriceRingBuffer> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let key = (base.clone(), quote.clone());
        let mut buffer: PriceRingBuffer = prices.get(key.clone()).unwrap_or(PriceRingBuffer::new(env));

        buffer.push(
            PriceEntry {
                price,
                timestamp: env.ledger().timestamp(),
                pusher: pusher.clone(),
            },
            TWAP_WINDOW_SIZE,
        );

        prices.set(key, buffer);
        storage.set(&KEY_PRICES, &prices);

        env.events().publish((EVT_PRICE,), (base, quote, price));
    }

    // =======================================================================
    // Price reads — view methods for consumer contracts
    // =======================================================================

    /// Return the most recent [`PriceEntry`] for the specified asset pair.
    pub fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry {
        let history = Self::get_price_history(env, base, quote);
        if history.is_empty() {
            panic_with_error!(env, OracleError::PriceNotFound);
        }
        history.get(history.len() - 1).unwrap()
    }

    /// Return the full rolling history (up to `TWAP_WINDOW_SIZE` entries), oldest-to-newest.
    pub fn get_price_history(env: &Env, base: Symbol, quote: Symbol) -> Vec<PriceEntry> {
        let storage = env.storage().instance();
        let prices: Map<(Symbol, Symbol), PriceRingBuffer> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));
        let key = (base, quote);
        match prices.get(key) {
            Some(buffer) => buffer.chronological(env, TWAP_WINDOW_SIZE),
            None => Vec::new(env),
        }
    }

    // =======================================================================
    // Price reads — staleness-aware
    // =======================================================================

    /// Fetch the latest price annotated with age/staleness metadata.
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

    /// Like [`get_price_checked`] but panics with [`OracleError::PriceStale`] when stale.
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
    pub fn get_twap(env: &Env, base: Symbol, quote: Symbol) -> i128 {
        let history = Self::get_price_history(env, base, quote);

        if history.len() < 2 {
            panic_with_error!(env, OracleError::InsufficientHistory);
        }

        let now = env.ledger().timestamp();
        compute_twap(&history, now)
    }

    /// Compute TWAP over the last `window_seconds`.
    pub fn get_twap_window(env: &Env, base: Symbol, quote: Symbol, window_seconds: u64) -> i128 {
        let history = Self::get_price_history(env, base, quote);

        if history.is_empty() {
            panic_with_error!(env, OracleError::PriceNotFound);
        }

        let now = env.ledger().timestamp();
        let window_start = now.saturating_sub(window_seconds);
        compute_twap_window(&history, now, window_start)
    }

    /// TWAP over the last 5 minutes.
    pub fn get_twap_5m(env: &Env, base: Symbol, quote: Symbol) -> i128 {
        Self::get_twap_window(env, base, quote, WINDOW_5M)
    }

    /// TWAP over the last 15 minutes.
    pub fn get_twap_15m(env: &Env, base: Symbol, quote: Symbol) -> i128 {
        Self::get_twap_window(env, base, quote, WINDOW_15M)
    }

    /// TWAP over the last hour.
    pub fn get_twap_1h(env: &Env, base: Symbol, quote: Symbol) -> i128 {
        Self::get_twap_window(env, base, quote, WINDOW_1H)
    }

    // =======================================================================
    // Multi-asset helpers
    // =======================================================================

    /// Return the latest prices for all registered pairs.
    pub fn get_all_prices(env: &Env) -> Map<(Symbol, Symbol), PriceEntry> {
        let storage = env.storage().instance();
        let prices: Map<(Symbol, Symbol), PriceRingBuffer> =
            storage.get(&KEY_PRICES).unwrap_or(Map::new(env));

        let mut latest: Map<(Symbol, Symbol), PriceEntry> = Map::new(env);
        for (key, buffer) in prices.iter() {
            let history = buffer.chronological(env, TWAP_WINDOW_SIZE);
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
