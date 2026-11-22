//! # Vesting
//!
//! Soroban token vesting with a cliff and linear release.
//!
//! A funder deposits tokens for a beneficiary when creating a schedule. The
//! beneficiary claims vested tokens over time, and the admin can revoke a
//! schedule, which pays out what has vested and refunds the rest to the funder.
//!
//! See `README.md` for the full interface, errors and deployment steps.

#![no_std]

mod types;

pub use types::{DataKey, VestingError, VestingSchedule};

use soroban_sdk::{
    contract, contractimpl, panic_with_error, symbol_short, token, Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Instance TTL (admin, token, contract instance and code): extend when
/// fewer than ~30 days remain. Same window as schedules, so the contract
/// never expires before the schedules it holds.
pub const INSTANCE_TTL_THRESHOLD: u32 = PERSISTENT_TTL_THRESHOLD;
/// Instance TTL: extend to ~120 days.
pub const INSTANCE_TTL_EXTEND: u32 = PERSISTENT_TTL_EXTEND;
/// Schedule TTL: extend when fewer than ~30 days remain.
pub const PERSISTENT_TTL_THRESHOLD: u32 = 518_400;
/// Schedule TTL: extend to ~120 days. Schedules can sit idle for months
/// between claims. Must stay below the network's `max_entry_ttl`
/// (3_110_400 ledgers on mainnet).
pub const PERSISTENT_TTL_EXTEND: u32 = 2_073_600;

const EVT_INIT: Symbol = symbol_short!("init");
const EVT_CREATED: Symbol = symbol_short!("created");
const EVT_CLAIMED: Symbol = symbol_short!("claimed");
const EVT_REVOKED: Symbol = symbol_short!("revoked");
const EVT_REFUND_DUE: Symbol = symbol_short!("refunddue");
const EVT_REFUNDED: Symbol = symbol_short!("refunded");

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/// Returns `floor(total_amount * elapsed / duration)` without overflowing.
///
/// `total_amount * elapsed` can need up to 191 bits, so it is split as
/// `total_amount = q * duration + r`, which gives
/// `q * elapsed + floor(r * elapsed / duration)`. The first term is at most
/// `total_amount` and `r * elapsed < 2^128` fits in a `u128`, so the result is
/// exact for every `total_amount >= 0` and `elapsed <= duration`.
///
/// Returns `total_amount` once `elapsed >= duration`, and `None` only if
/// `duration == 0` or `total_amount < 0`, which `create_schedule` rejects.
pub fn vested_amount(total_amount: i128, elapsed: u64, duration: u64) -> Option<i128> {
    if duration == 0 || total_amount < 0 {
        return None;
    }
    if elapsed >= duration {
        return Some(total_amount);
    }
    let d = duration as i128;
    let q = total_amount / d;
    let r = (total_amount % d) as u128;
    let whole = q.checked_mul(elapsed as i128)?;
    let part = r.checked_mul(elapsed as u128)? / duration as u128;
    whole.checked_add(i128::try_from(part).ok()?)
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
}

fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, VestingError::NotInitialized))
}

fn read_token(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Token)
        .unwrap_or_else(|| panic_with_error!(env, VestingError::NotInitialized))
}

fn token_client(env: &Env) -> token::Client<'_> {
    token::Client::new(env, &read_token(env))
}

fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
}

fn read_schedule(env: &Env, beneficiary: &Address) -> Option<VestingSchedule> {
    let key = DataKey::Schedule(beneficiary.clone());
    let schedule = env.storage().persistent().get(&key);
    if schedule.is_some() {
        bump_persistent(env, &key);
    }
    schedule
}

fn load_schedule(env: &Env, beneficiary: &Address) -> VestingSchedule {
    read_schedule(env, beneficiary)
        .unwrap_or_else(|| panic_with_error!(env, VestingError::ScheduleNotFound))
}

fn write_schedule(env: &Env, schedule: &VestingSchedule) {
    let key = DataKey::Schedule(schedule.beneficiary.clone());
    env.storage().persistent().set(&key, schedule);
    bump_persistent(env, &key);
}

fn read_refund(env: &Env, funder: &Address) -> i128 {
    let key = DataKey::Refund(funder.clone());
    let amount = env.storage().persistent().get(&key).unwrap_or(0);
    if amount > 0 {
        bump_persistent(env, &key);
    }
    amount
}

/// Amount vested at the current ledger time, `0` before the cliff.
/// A revoked schedule is fully vested at its reduced `total_amount`.
fn vested_now(env: &Env, schedule: &VestingSchedule) -> i128 {
    if schedule.revoked {
        return schedule.total_amount;
    }
    let now = env.ledger().timestamp();
    // `start + duration` is checked in `create_schedule` and `cliff <= duration`,
    // so neither sum can overflow here.
    if now < schedule.start + schedule.cliff {
        return 0;
    }
    let elapsed = now.saturating_sub(schedule.start).min(schedule.duration);
    vested_amount(schedule.total_amount, elapsed, schedule.duration)
        .unwrap_or_else(|| panic_with_error!(env, VestingError::MathOverflow))
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct VestingContract;

#[contractimpl]
impl VestingContract {
    /// Sets the admin and the token this contract vests. Must be called once,
    /// signed by `admin`, before any schedule is created.
    ///
    /// soroban-sdk 21 has no constructor, so deploy and initialize back to back:
    /// until this runs, anyone could initialize with their own admin and token.
    ///
    /// Errors: `AlreadyInitialized`.
    ///
    /// Emits `("init")` with data `(admin, token)`.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VestingError::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        bump_instance(&env);

        env.events().publish((EVT_INIT,), (admin, token));
    }

    /// Creates a schedule for `beneficiary` and moves `total_amount` tokens
    /// from `funder` into the contract. Signed by `funder`; the signature also
    /// covers the token transfer.
    ///
    /// Each beneficiary can have one open schedule at a time. A schedule that
    /// has been fully claimed (including a revoked one) is replaced. `start`
    /// may be in the past (a backdated grant), in which case part of it is
    /// vested already.
    ///
    /// Errors: `NotInitialized`, `InvalidAmount`, `InvalidDuration`,
    /// `CliffExceedsDuration`, `TimeOverflow`, `InvalidBeneficiary`,
    /// `ScheduleExists`. Fails if `funder` cannot cover `total_amount`.
    ///
    /// Emits `("created", beneficiary)` with data
    /// `(funder, total_amount, start, cliff, duration)`.
    pub fn create_schedule(
        env: Env,
        funder: Address,
        beneficiary: Address,
        total_amount: i128,
        start: u64,
        cliff: u64,
        duration: u64,
    ) {
        funder.require_auth();

        if total_amount <= 0 {
            panic_with_error!(&env, VestingError::InvalidAmount);
        }
        if duration == 0 {
            panic_with_error!(&env, VestingError::InvalidDuration);
        }
        if cliff > duration {
            panic_with_error!(&env, VestingError::CliffExceedsDuration);
        }
        if start.checked_add(duration).is_none() {
            panic_with_error!(&env, VestingError::TimeOverflow);
        }
        let contract = env.current_contract_address();
        if beneficiary == contract {
            panic_with_error!(&env, VestingError::InvalidBeneficiary);
        }

        let token = token_client(&env);
        bump_instance(&env);

        let existing: Option<VestingSchedule> = env
            .storage()
            .persistent()
            .get(&DataKey::Schedule(beneficiary.clone()));
        if let Some(existing) = existing {
            if existing.claimed < existing.total_amount {
                panic_with_error!(&env, VestingError::ScheduleExists);
            }
        }

        write_schedule(
            &env,
            &VestingSchedule {
                funder: funder.clone(),
                beneficiary: beneficiary.clone(),
                total_amount,
                claimed: 0,
                start,
                cliff,
                duration,
                revoked: false,
            },
        );

        token.transfer(&funder, &contract, &total_amount);

        env.events().publish(
            (EVT_CREATED, beneficiary),
            (funder, total_amount, start, cliff, duration),
        );
    }

    /// Sends everything vested and not yet claimed to `beneficiary` and returns
    /// the amount sent. Signed by `beneficiary`.
    ///
    /// Errors: `NotInitialized`, `ScheduleNotFound`, `CliffNotReached`,
    /// `NothingToClaim`.
    ///
    /// Emits `("claimed", beneficiary)` with data `amount`.
    pub fn claim_tokens(env: Env, beneficiary: Address) -> i128 {
        beneficiary.require_auth();

        let token = token_client(&env);
        bump_instance(&env);
        let mut schedule = load_schedule(&env, &beneficiary);

        if !schedule.revoked && env.ledger().timestamp() < schedule.start + schedule.cliff {
            panic_with_error!(&env, VestingError::CliffNotReached);
        }

        // `vested <= total_amount` and `claimed <= vested`, so this cannot overflow.
        let claimable = vested_now(&env, &schedule) - schedule.claimed;
        if claimable <= 0 {
            panic_with_error!(&env, VestingError::NothingToClaim);
        }

        // Record the claim before paying out.
        schedule.claimed += claimable;
        write_schedule(&env, &schedule);

        token.transfer(&env.current_contract_address(), &beneficiary, &claimable);

        env.events().publish((EVT_CLAIMED, beneficiary), claimable);
        claimable
    }

    /// Stops `beneficiary`'s schedule at the current time. Signed by the admin.
    ///
    /// What has vested stays claimable by the beneficiary through
    /// `claim_tokens`; the unvested rest goes back to the funder. Revoke never
    /// pushes tokens to the beneficiary, and if the refund transfer to the
    /// funder fails (for example a missing trustline or a deauthorized
    /// balance), the amount is kept for `withdraw_refund` instead, so neither
    /// party can block a revoke.
    ///
    /// When nothing is left to claim, the schedule is deleted right away, so
    /// a new one can be created for the same beneficiary.
    ///
    /// Returns `(still_claimable_by_beneficiary, refunded_to_funder)`.
    ///
    /// Errors: `NotInitialized`, `ScheduleNotFound`, `AlreadyRevoked`.
    ///
    /// Emits `("revoked", beneficiary)` with data
    /// `(still_claimable_by_beneficiary, refunded_to_funder)`, plus
    /// `("refunddue", funder)` with data `amount` if the refund was deferred.
    pub fn revoke_schedule(env: Env, beneficiary: Address) -> (i128, i128) {
        let admin = read_admin(&env);
        admin.require_auth();

        let token = token_client(&env);
        bump_instance(&env);
        let mut schedule = load_schedule(&env, &beneficiary);
        if schedule.revoked {
            panic_with_error!(&env, VestingError::AlreadyRevoked);
        }

        let vested = vested_now(&env, &schedule);
        let claimable = vested - schedule.claimed;
        let refund = schedule.total_amount - vested;

        if claimable > 0 {
            schedule.total_amount = vested;
            schedule.revoked = true;
            write_schedule(&env, &schedule);
        } else {
            env.storage()
                .persistent()
                .remove(&DataKey::Schedule(beneficiary.clone()));
        }

        if refund > 0 {
            let contract = env.current_contract_address();
            let sent = matches!(
                token.try_transfer(&contract, &schedule.funder, &refund),
                Ok(Ok(()))
            );
            if !sent {
                let owed = read_refund(&env, &schedule.funder)
                    .checked_add(refund)
                    .unwrap_or_else(|| panic_with_error!(&env, VestingError::MathOverflow));
                let key = DataKey::Refund(schedule.funder.clone());
                env.storage().persistent().set(&key, &owed);
                bump_persistent(&env, &key);
                env.events()
                    .publish((EVT_REFUND_DUE, schedule.funder.clone()), refund);
            }
        }

        env.events()
            .publish((EVT_REVOKED, beneficiary), (claimable, refund));
        (claimable, refund)
    }

    /// Pays out a refund that could not be sent during `revoke_schedule`.
    /// Signed by `funder`. Returns the amount sent.
    ///
    /// Errors: `NotInitialized`, `NothingToWithdraw`.
    ///
    /// Emits `("refunded", funder)` with data `amount`.
    pub fn withdraw_refund(env: Env, funder: Address) -> i128 {
        funder.require_auth();

        let token = token_client(&env);
        bump_instance(&env);
        let amount = read_refund(&env, &funder);
        if amount <= 0 {
            panic_with_error!(&env, VestingError::NothingToWithdraw);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::Refund(funder.clone()));
        token.transfer(&env.current_contract_address(), &funder, &amount);

        env.events().publish((EVT_REFUNDED, funder), amount);
        amount
    }

    /// Deferred refund `funder` can collect with `withdraw_refund`, usually `0`.
    pub fn get_refund(env: Env, funder: Address) -> i128 {
        bump_instance(&env);
        read_refund(&env, &funder)
    }

    /// Total vested so far (claimed or not), `0` before the cliff.
    ///
    /// Errors: `ScheduleNotFound`.
    pub fn get_vested_amount(env: Env, beneficiary: Address) -> i128 {
        bump_instance(&env);
        let schedule = load_schedule(&env, &beneficiary);
        vested_now(&env, &schedule)
    }

    /// Total already paid to `beneficiary`, `0` if there is no schedule.
    pub fn get_claimed_amount(env: Env, beneficiary: Address) -> i128 {
        bump_instance(&env);
        read_schedule(&env, &beneficiary)
            .map(|s| s.claimed)
            .unwrap_or(0)
    }

    /// The schedule of `beneficiary`, if any.
    pub fn get_schedule(env: Env, beneficiary: Address) -> Option<VestingSchedule> {
        bump_instance(&env);
        read_schedule(&env, &beneficiary)
    }

    /// The admin set by `initialize`.
    ///
    /// Errors: `NotInitialized`.
    pub fn get_admin(env: Env) -> Address {
        let admin = read_admin(&env);
        bump_instance(&env);
        admin
    }

    /// The token set by `initialize`.
    ///
    /// Errors: `NotInitialized`.
    pub fn get_token(env: Env) -> Address {
        let token = read_token(&env);
        bump_instance(&env);
        token
    }
}

#[cfg(test)]
mod test;
