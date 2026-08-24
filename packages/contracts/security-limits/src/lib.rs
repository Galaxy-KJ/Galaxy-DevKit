//! Security Limits contract for Galaxy DevKit.
//!
//! Per-owner spending limits and risk profiles for automated trading.
//! Mutating entry points require host authorization. Per-user state lives in
//! persistent storage so one account's reads never deserialize another.

#![no_std]

mod events;
mod storage;
mod types;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Symbol, Vec};

pub use types::{
    CheckResult, DataKey, LimitType, RiskLevel, RiskProfile, SecurityLimit, SecurityLimitsError,
    Usage, DAILY_WINDOW_SECS,
};

use storage::{
    bump_instance, daily_volume_asset, effective_usage, get_enforcer, load_limits, load_profile,
    load_usage, require_init, save_limits, save_profile, save_usage, take_next_limit_id,
    take_next_tx_id,
};

#[contract]
pub struct SecurityLimitsContract;

fn require_owner_auth(owner: &Address) {
    owner.require_auth();
}

/// Recording is gated by the stored enforcer (automation engine).
/// Pass the owner as `enforcer` at `initialize` to let the owner self-record.
fn require_enforcer_auth(env: &Env) -> Address {
    let enforcer = get_enforcer(env);
    enforcer.require_auth();
    enforcer
}

fn asset_allowed(profile: &RiskProfile, asset: &Symbol) -> bool {
    for blacklisted in profile.blacklisted_assets.iter() {
        if blacklisted == *asset {
            return false;
        }
    }
    if profile.allowed_assets.len() > 0 {
        for allowed in profile.allowed_assets.iter() {
            if allowed == *asset {
                return true;
            }
        }
        return false;
    }
    true
}

fn window_for_limit(limit: &SecurityLimit) -> u64 {
    match limit.limit_type {
        LimitType::PerTransaction => 0,
        _ => limit.time_window,
    }
}

fn evaluate_limits(
    env: &Env,
    owner: &Address,
    asset: &Symbol,
    amount: u64,
) -> CheckResult {
    if amount == 0 {
        return CheckResult::denied(SecurityLimitsError::InvalidAmount);
    }

    if let Some(profile) = load_profile(env, owner) {
        if !asset_allowed(&profile, asset) {
            return CheckResult::denied(SecurityLimitsError::AssetNotAllowed);
        }
        if amount > profile.max_single_transaction {
            return CheckResult::denied(SecurityLimitsError::LimitExceeded);
        }

        let now = env.ledger().timestamp();
        let daily_asset = daily_volume_asset(env);
        let usage = load_usage(env, owner, &daily_asset);
        let (current, _) =
            effective_usage(usage.amount, usage.last_reset, DAILY_WINDOW_SECS, now);
        match current.checked_add(amount) {
            Some(projected) if projected > profile.max_daily_volume => {
                return CheckResult::denied(SecurityLimitsError::LimitExceeded);
            }
            None => return CheckResult::denied(SecurityLimitsError::Overflow),
            _ => {}
        }
    }

    let limits = load_limits(env, owner);
    let now = env.ledger().timestamp();
    for (_, limit) in limits.iter() {
        if !limit.is_active || limit.asset != *asset {
            continue;
        }
        if matches!(limit.limit_type, LimitType::PerTransaction) {
            if amount > limit.max_amount {
                return CheckResult::denied(SecurityLimitsError::LimitExceeded);
            }
            continue;
        }
        let window = window_for_limit(&limit);
        let (current, _) = effective_usage(limit.current_usage, limit.last_reset, window, now);
        match current.checked_add(amount) {
            Some(projected) if projected > limit.max_amount => {
                return CheckResult::denied(SecurityLimitsError::LimitExceeded);
            }
            None => return CheckResult::denied(SecurityLimitsError::Overflow),
            _ => {}
        }
    }

    CheckResult::ok()
}

fn persist_usage(env: &Env, owner: &Address, asset: &Symbol, amount: u64) -> Result<(), SecurityLimitsError> {
    let now = env.ledger().timestamp();
    let mut limits = load_limits(env, owner);
    let mut changed = false;

    // Map::keys then get to mutate; iterate a snapshot of ids.
    let ids: Vec<u64> = limits.keys();
    for id in ids.iter() {
        let mut limit = match limits.get(id) {
            Some(l) => l,
            None => continue,
        };
        if !limit.is_active || limit.asset != *asset {
            continue;
        }
        if matches!(limit.limit_type, LimitType::PerTransaction) {
            continue;
        }
        let window = window_for_limit(&limit);
        let (current, reset_at) =
            effective_usage(limit.current_usage, limit.last_reset, window, now);
        let next = current
            .checked_add(amount)
            .ok_or(SecurityLimitsError::Overflow)?;
        limit.current_usage = next;
        limit.last_reset = reset_at;
        limits.set(id, limit);
        changed = true;
    }
    if changed {
        save_limits(env, owner, &limits);
    }

    if load_profile(env, owner).is_some() {
        let daily_asset = daily_volume_asset(env);
        let usage = load_usage(env, owner, &daily_asset);
        let (current, reset_at) =
            effective_usage(usage.amount, usage.last_reset, DAILY_WINDOW_SECS, now);
        let next = current
            .checked_add(amount)
            .ok_or(SecurityLimitsError::Overflow)?;
        save_usage(
            env,
            owner,
            &daily_asset,
            &Usage {
                amount: next,
                last_reset: reset_at,
            },
        );
    }

    Ok(())
}

#[contractimpl]
impl SecurityLimitsContract {
    /// Initialize once with an `admin` and an `enforcer`.
    ///
    /// `enforcer` is the address allowed to call [`Self::record_transaction`]
    /// (the automation engine). Pass the same address as `admin` for a
    /// single-operator deployment. Re-initialization returns
    /// [`SecurityLimitsError::AlreadyInitialized`].
    pub fn initialize(
        env: &Env,
        admin: Address,
        enforcer: Address,
    ) -> Result<(), SecurityLimitsError> {
        admin.require_auth();
        let storage = env.storage().instance();
        if storage.has(&DataKey::Admin) {
            return Err(SecurityLimitsError::AlreadyInitialized);
        }
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::Enforcer, &enforcer);
        storage.set(&DataKey::NextLimitId, &1u64);
        storage.set(&DataKey::NextTxId, &1u64);
        bump_instance(env);
        Ok(())
    }

    /// Create a new limit for `owner`. Requires `owner` authorization.
    pub fn create_security_limit(
        env: &Env,
        owner: Address,
        limit_type: LimitType,
        asset: Symbol,
        max_amount: u64,
        time_window: u64,
    ) -> Result<u64, SecurityLimitsError> {
        require_init(env);
        require_owner_auth(&owner);
        if max_amount == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }
        if !matches!(limit_type, LimitType::PerTransaction) && time_window == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }

        let id = take_next_limit_id(env);
        let now = env.ledger().timestamp();
        let limit = SecurityLimit {
            id,
            owner: owner.clone(),
            limit_type,
            asset: asset.clone(),
            max_amount,
            time_window,
            current_usage: 0,
            last_reset: now,
            is_active: true,
            created_at: now,
        };

        let mut limits = load_limits(env, &owner);
        limits.set(id, limit);
        save_limits(env, &owner, &limits);
        events::limit_created(env, &owner, &asset, id);
        Ok(id)
    }

    /// Read-only check. Never writes. Consults the risk profile and every
    /// active limit for `(owner, asset)`.
    pub fn check_transaction_allowed(
        env: &Env,
        owner: Address,
        asset: Symbol,
        amount: u64,
    ) -> CheckResult {
        require_init(env);
        bump_instance(env);
        evaluate_limits(env, &owner, &asset, amount)
    }

    /// Record a filled trade against `owner`'s limits. Requires the stored
    /// enforcer to authorize. Does not keep an on-chain history vec; emits
    /// `tx_recorded` instead. When the check fails, emits `limit_breached`
    /// and returns the typed reason.
    pub fn record_transaction(
        env: &Env,
        owner: Address,
        asset: Symbol,
        amount: u64,
        transaction_hash: BytesN<32>,
    ) -> Result<u64, SecurityLimitsError> {
        require_init(env);
        require_enforcer_auth(env);
        if amount == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }

        let check = evaluate_limits(env, &owner, &asset, amount);
        if !check.allowed {
            let reason = check.reason.unwrap_or(SecurityLimitsError::LimitExceeded as u32);
            events::limit_breached(env, &owner, &asset, reason, amount);
            return Err(match reason {
                3 => SecurityLimitsError::LimitExceeded,
                4 => SecurityLimitsError::AssetNotAllowed,
                6 => SecurityLimitsError::InvalidAmount,
                7 => SecurityLimitsError::Overflow,
                _ => SecurityLimitsError::LimitExceeded,
            });
        }

        persist_usage(env, &owner, &asset, amount)?;
        let tx_id = take_next_tx_id(env);
        events::tx_recorded(env, &owner, &asset, amount, &transaction_hash, tx_id);
        Ok(tx_id)
    }

    /// Limits of a single owner. Does not scan other accounts.
    pub fn get_security_limits(env: &Env, owner: Address) -> Vec<SecurityLimit> {
        require_init(env);
        bump_instance(env);
        let limits = load_limits(env, &owner);
        let mut out = Vec::new(env);
        for (_, limit) in limits.iter() {
            out.push_back(limit);
        }
        out
    }

    /// Update an existing limit. Requires `owner` authorization and that the
    /// limit lives in that owner's map.
    pub fn update_security_limit(
        env: &Env,
        limit_id: u64,
        owner: Address,
        max_amount: u64,
        time_window: u64,
        is_active: bool,
    ) -> Result<(), SecurityLimitsError> {
        require_init(env);
        require_owner_auth(&owner);
        if max_amount == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }

        let mut limits = load_limits(env, &owner);
        let mut limit = limits
            .get(limit_id)
            .ok_or(SecurityLimitsError::LimitNotFound)?;
        if !matches!(limit.limit_type, LimitType::PerTransaction) && time_window == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }
        limit.max_amount = max_amount;
        limit.time_window = time_window;
        limit.is_active = is_active;
        let asset = limit.asset.clone();
        limits.set(limit_id, limit);
        save_limits(env, &owner, &limits);
        events::limit_updated(env, &owner, &asset, limit_id);
        Ok(())
    }

    /// Delete a limit. Requires `owner` authorization.
    pub fn delete_security_limit(
        env: &Env,
        limit_id: u64,
        owner: Address,
    ) -> Result<(), SecurityLimitsError> {
        require_init(env);
        require_owner_auth(&owner);
        let mut limits = load_limits(env, &owner);
        let limit = limits
            .get(limit_id)
            .ok_or(SecurityLimitsError::LimitNotFound)?;
        let asset = limit.asset.clone();
        limits.remove(limit_id);
        save_limits(env, &owner, &limits);
        events::limit_deleted(env, &owner, &asset, limit_id);
        Ok(())
    }

    /// Create or replace the owner's risk profile. Requires `owner` authorization.
    pub fn set_risk_profile(
        env: &Env,
        owner: Address,
        risk_level: RiskLevel,
        max_daily_volume: u64,
        max_single_transaction: u64,
        allowed_assets: Vec<Symbol>,
        blacklisted_assets: Vec<Symbol>,
    ) -> Result<(), SecurityLimitsError> {
        require_init(env);
        require_owner_auth(&owner);
        if max_daily_volume == 0 || max_single_transaction == 0 {
            return Err(SecurityLimitsError::InvalidAmount);
        }

        let now = env.ledger().timestamp();
        let created_at = load_profile(env, &owner)
            .map(|p| p.created_at)
            .unwrap_or(now);
        let profile = RiskProfile {
            owner: owner.clone(),
            risk_level,
            max_daily_volume,
            max_single_transaction,
            allowed_assets,
            blacklisted_assets,
            created_at,
            updated_at: now,
        };
        save_profile(env, &owner, &profile);
        events::profile_set(env, &owner);
        Ok(())
    }

    pub fn get_risk_profile(env: &Env, owner: Address) -> Option<RiskProfile> {
        require_init(env);
        bump_instance(env);
        load_profile(env, &owner)
    }

    pub fn is_asset_allowed(env: &Env, owner: Address, asset: Symbol) -> bool {
        require_init(env);
        bump_instance(env);
        match load_profile(env, &owner) {
            Some(profile) => asset_allowed(&profile, &asset),
            None => true,
        }
    }

    pub fn get_admin(env: &Env) -> Address {
        require_init(env);
        bump_instance(env);
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn get_enforcer(env: &Env) -> Address {
        require_init(env);
        bump_instance(env);
        get_enforcer(env)
    }
}

#[cfg(test)]
mod test;
