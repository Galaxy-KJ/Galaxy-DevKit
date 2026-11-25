//! # Timelock
//!
//! Soroban timelock that delays contract calls.
//!
//! An admin (an account, or a governance contract) queues a call
//! `(target, fn_name, args)` with an `eta` at least `min_delay` seconds away.
//! Once the ledger reaches `eta`, the admin can execute it, which invokes
//! `target.fn_name(args)` with the timelock as the caller. A call not executed
//! within `grace_period` seconds after `eta` expires. The admin can cancel a
//! queued call at any time before it is executed.
//!
//! See `README.md` for the full interface, errors and events.

#![no_std]

mod types;

pub use types::{DataKey, QueuedTransaction, TimelockError};

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, xdr::ToXdr, Address, BytesN, Env,
    Symbol, Val, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Upper bound for `min_delay` and for how far in the future `eta` can be
/// (30 days).
pub const MAXIMUM_DELAY: u64 = 30 * 24 * 60 * 60;
/// Upper bound for `grace_period` (30 days).
pub const MAXIMUM_GRACE_PERIOD: u64 = 30 * 24 * 60 * 60;

/// Instance TTL (admin and delays): extend when fewer than ~30 days remain.
pub const INSTANCE_TTL_THRESHOLD: u32 = PERSISTENT_TTL_THRESHOLD;
/// Instance TTL: extend to ~120 days.
pub const INSTANCE_TTL_EXTEND: u32 = PERSISTENT_TTL_EXTEND;
/// Transaction entry TTL: extend when fewer than ~30 days remain.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
/// Transaction entry TTL: extend to ~120 days. A queued entry must outlive
/// `eta + grace_period`, which is at most `MAXIMUM_DELAY + MAXIMUM_GRACE_PERIOD`
/// (60 days) after queueing. Must stay below the network's `max_entry_ttl`.
pub const PERSISTENT_TTL_EXTEND: u32 = 2_073_600;

const EVT_INIT: Symbol = symbol_short!("init");
const EVT_QUEUED: Symbol = symbol_short!("queued");
const EVT_EXECUTED: Symbol = symbol_short!("executed");
const EVT_CANCELLED: Symbol = symbol_short!("cancelled");

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
}

/// Extends a persistent entry, then brings the instance up to the full window
/// so the contract never expires before the entries it holds.
fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
    env.storage()
        .instance()
        .extend_ttl(PERSISTENT_TTL_EXTEND, PERSISTENT_TTL_EXTEND);
}

fn read_u64(env: &Env, key: &DataKey) -> u64 {
    env.storage()
        .instance()
        .get(key)
        .unwrap_or_else(|| panic_with_error!(env, TimelockError::NotInitialized))
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, TimelockError::NotInitialized))
}

/// Loads the admin and requires its signature.
fn require_admin(env: &Env) -> Address {
    let admin = read_admin(env);
    admin.require_auth();
    admin
}

fn read_queued(env: &Env, tx_hash: &BytesN<32>) -> Option<QueuedTransaction> {
    let key = DataKey::Queued(tx_hash.clone());
    let tx = env.storage().persistent().get(&key);
    if tx.is_some() {
        bump_persistent(env, &key);
    }
    tx
}

fn load_queued(env: &Env, tx_hash: &BytesN<32>) -> QueuedTransaction {
    read_queued(env, tx_hash).unwrap_or_else(|| panic_with_error!(env, TimelockError::NotQueued))
}

fn compute_hash(
    env: &Env,
    target: &Address,
    fn_name: &Symbol,
    args: &Vec<Val>,
    eta: u64,
) -> BytesN<32> {
    let payload = (target.clone(), fn_name.clone(), args.clone(), eta).to_xdr(env);
    env.crypto().sha256(&payload).into()
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct TimelockContract;

#[contractimpl]
impl TimelockContract {
    /// Sets the admin, the minimum delay and the grace period. Must be called
    /// once, signed by `admin`, before anything is queued. `admin` can be a
    /// governance contract.
    ///
    /// soroban-sdk 21 has no constructor, so deploy and initialize back to back.
    ///
    /// Errors: `AlreadyInitialized`, `InvalidDelay`, `InvalidGracePeriod`.
    ///
    /// Emits `("init")` with data `(admin, min_delay, grace_period)`.
    pub fn initialize(env: Env, admin: Address, min_delay: u64, grace_period: u64) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, TimelockError::AlreadyInitialized);
        }
        admin.require_auth();

        if min_delay == 0 || min_delay > MAXIMUM_DELAY {
            panic_with_error!(&env, TimelockError::InvalidDelay);
        }
        if grace_period == 0 || grace_period > MAXIMUM_GRACE_PERIOD {
            panic_with_error!(&env, TimelockError::InvalidGracePeriod);
        }

        let storage = env.storage().instance();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::MinDelay, &min_delay);
        storage.set(&DataKey::GracePeriod, &grace_period);
        bump_instance(&env);

        env.events()
            .publish((EVT_INIT,), (admin, min_delay, grace_period));
    }

    /// Queues `target.fn_name(args)` to run at or after `eta`. Signed by the
    /// admin. Returns the transaction hash, `sha256(xdr((target, fn_name, args, eta)))`.
    ///
    /// `eta` must satisfy `now + min_delay <= eta <= now + MAXIMUM_DELAY`.
    ///
    /// Errors: `NotInitialized`, `EtaTooEarly`, `EtaTooLate`, `AlreadyQueued`,
    /// `AlreadyExecuted`, `TimeOverflow`.
    ///
    /// Emits `("queued", tx_hash)` with data `(target, fn_name, args, eta)`.
    pub fn queue_transaction(
        env: Env,
        target: Address,
        fn_name: Symbol,
        args: Vec<Val>,
        eta: u64,
    ) -> BytesN<32> {
        require_admin(&env);

        let now = env.ledger().timestamp();
        let min_delay = read_u64(&env, &DataKey::MinDelay);
        let earliest = now
            .checked_add(min_delay)
            .unwrap_or_else(|| panic_with_error!(&env, TimelockError::TimeOverflow));
        let latest = now
            .checked_add(MAXIMUM_DELAY)
            .unwrap_or_else(|| panic_with_error!(&env, TimelockError::TimeOverflow));
        if eta < earliest {
            panic_with_error!(&env, TimelockError::EtaTooEarly);
        }
        if eta > latest {
            panic_with_error!(&env, TimelockError::EtaTooLate);
        }

        let tx_hash = compute_hash(&env, &target, &fn_name, &args, eta);
        let key = DataKey::Queued(tx_hash.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, TimelockError::AlreadyQueued);
        }
        // Unreachable today (an executed call has `eta <= now < earliest`),
        // kept so a hash can never run twice.
        if env
            .storage()
            .persistent()
            .has(&DataKey::Executed(tx_hash.clone()))
        {
            panic_with_error!(&env, TimelockError::AlreadyExecuted);
        }

        let tx = QueuedTransaction {
            target: target.clone(),
            fn_name: fn_name.clone(),
            args: args.clone(),
            eta,
            queued_at: now,
        };
        env.storage().persistent().set(&key, &tx);
        bump_persistent(&env, &key);

        env.events()
            .publish((EVT_QUEUED, tx_hash.clone()), (target, fn_name, args, eta));

        tx_hash
    }

    /// Runs a queued call. Signed by the admin. Allowed from `eta` up to and
    /// including `eta + grace_period`. The call is made with the timelock as
    /// the invoker, so the target can authorize it with
    /// `timelock_address.require_auth()`. Returns the target's return value.
    ///
    /// The transaction is marked executed before the call; if the call fails,
    /// the whole invocation (including that mark) is rolled back.
    ///
    /// Errors: `NotInitialized`, `AlreadyExecuted`, `NotQueued`, `NotReady`,
    /// `Expired`, `TimeOverflow`.
    ///
    /// Emits `("executed", tx_hash)` with data `(target, fn_name)`.
    pub fn execute_transaction(env: Env, tx_hash: BytesN<32>) -> Val {
        require_admin(&env);

        let executed_key = DataKey::Executed(tx_hash.clone());
        if env.storage().persistent().has(&executed_key) {
            panic_with_error!(&env, TimelockError::AlreadyExecuted);
        }

        let tx = load_queued(&env, &tx_hash);
        let now = env.ledger().timestamp();
        if now < tx.eta {
            panic_with_error!(&env, TimelockError::NotReady);
        }
        let grace_period = read_u64(&env, &DataKey::GracePeriod);
        let deadline = tx
            .eta
            .checked_add(grace_period)
            .unwrap_or_else(|| panic_with_error!(&env, TimelockError::TimeOverflow));
        if now > deadline {
            panic_with_error!(&env, TimelockError::Expired);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::Queued(tx_hash.clone()));
        env.storage().persistent().set(&executed_key, &true);
        bump_persistent(&env, &executed_key);

        let result: Val = env.invoke_contract(&tx.target, &tx.fn_name, tx.args);

        env.events()
            .publish((EVT_EXECUTED, tx_hash), (tx.target, tx.fn_name));

        result
    }

    /// Cancels a queued call. Signed by the admin. Works at any time before
    /// the call is executed, including after it has expired.
    ///
    /// Errors: `NotInitialized`, `NotQueued`.
    ///
    /// Emits `("cancelled", tx_hash)` with data `(target, fn_name)`.
    pub fn revoke_transaction(env: Env, tx_hash: BytesN<32>) {
        require_admin(&env);

        let tx = load_queued(&env, &tx_hash);
        env.storage()
            .persistent()
            .remove(&DataKey::Queued(tx_hash.clone()));
        bump_instance(&env);

        env.events()
            .publish((EVT_CANCELLED, tx_hash), (tx.target, tx.fn_name));
    }

    /// Returns the queued call for `tx_hash`, or `None` if it is not queued
    /// (never queued, executed or cancelled).
    pub fn get_queued_transaction(env: Env, tx_hash: BytesN<32>) -> Option<QueuedTransaction> {
        bump_instance(&env);
        read_queued(&env, &tx_hash)
    }

    /// Returns `true` if `tx_hash` was executed.
    pub fn is_executed(env: Env, tx_hash: BytesN<32>) -> bool {
        bump_instance(&env);
        env.storage().persistent().has(&DataKey::Executed(tx_hash))
    }

    /// Returns the hash `queue_transaction` would return for this call.
    pub fn hash_transaction(
        env: Env,
        target: Address,
        fn_name: Symbol,
        args: Vec<Val>,
        eta: u64,
    ) -> BytesN<32> {
        compute_hash(&env, &target, &fn_name, &args, eta)
    }

    /// Returns the admin.
    ///
    /// Errors: `NotInitialized`.
    pub fn get_admin(env: Env) -> Address {
        bump_instance(&env);
        read_admin(&env)
    }

    /// Returns the minimum delay in seconds.
    ///
    /// Errors: `NotInitialized`.
    pub fn get_min_delay(env: Env) -> u64 {
        bump_instance(&env);
        read_u64(&env, &DataKey::MinDelay)
    }

    /// Returns the grace period in seconds.
    ///
    /// Errors: `NotInitialized`.
    pub fn get_grace_period(env: Env) -> u64 {
        bump_instance(&env);
        read_u64(&env, &DataKey::GracePeriod)
    }
}

#[cfg(test)]
mod test;
