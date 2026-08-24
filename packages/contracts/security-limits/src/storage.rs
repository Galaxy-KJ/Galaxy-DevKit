//! Persistent / instance storage helpers with TTL extension on every access.

use soroban_sdk::{Address, Env, Map, Symbol};

use crate::types::{
    DataKey, RiskProfile, SecurityLimit, Usage, TTL_EXTEND, TTL_THRESHOLD,
};

/// Reserved usage key for the risk-profile 24h volume (all assets).
pub fn daily_volume_asset(env: &Env) -> Symbol {
    Symbol::new(env, "DAILYVOL")
}

pub fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

pub fn bump_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND);
}

pub fn require_init(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized")
}

pub fn get_enforcer(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Enforcer)
        .expect("not initialized")
}

pub fn load_limits(env: &Env, owner: &Address) -> Map<u64, SecurityLimit> {
    let key = DataKey::Limits(owner.clone());
    let limits: Map<u64, SecurityLimit> = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Map::new(env));
    if env.storage().persistent().has(&key) {
        bump_persistent(env, &key);
    }
    limits
}

pub fn save_limits(env: &Env, owner: &Address, limits: &Map<u64, SecurityLimit>) {
    let key = DataKey::Limits(owner.clone());
    env.storage().persistent().set(&key, limits);
    bump_persistent(env, &key);
    bump_instance(env);
}

pub fn load_profile(env: &Env, owner: &Address) -> Option<RiskProfile> {
    let key = DataKey::Profile(owner.clone());
    let profile = env.storage().persistent().get(&key);
    if profile.is_some() {
        bump_persistent(env, &key);
    }
    profile
}

pub fn save_profile(env: &Env, owner: &Address, profile: &RiskProfile) {
    let key = DataKey::Profile(owner.clone());
    env.storage().persistent().set(&key, profile);
    bump_persistent(env, &key);
    bump_instance(env);
}

pub fn load_usage(env: &Env, owner: &Address, asset: &Symbol) -> Usage {
    let key = DataKey::Usage(owner.clone(), asset.clone());
    let usage = env.storage().persistent().get(&key).unwrap_or(Usage {
        amount: 0,
        last_reset: 0,
    });
    if env.storage().persistent().has(&key) {
        bump_persistent(env, &key);
    }
    usage
}

pub fn save_usage(env: &Env, owner: &Address, asset: &Symbol, usage: &Usage) {
    let key = DataKey::Usage(owner.clone(), asset.clone());
    env.storage().persistent().set(&key, usage);
    bump_persistent(env, &key);
}

/// Effective usage after applying a rolling-window reset. Does not persist.
pub fn effective_usage(usage_amount: u64, last_reset: u64, window: u64, now: u64) -> (u64, u64) {
    if window > 0 && now.saturating_sub(last_reset) >= window {
        (0, now)
    } else {
        (usage_amount, last_reset)
    }
}

/// Next globally unique limit id. Stored in instance storage.
pub fn take_next_limit_id(env: &Env) -> u64 {
    let storage = env.storage().instance();
    let id: u64 = storage.get(&DataKey::NextLimitId).unwrap_or(1);
    storage.set(&DataKey::NextLimitId, &(id + 1));
    bump_instance(env);
    id
}

pub fn take_next_tx_id(env: &Env) -> u64 {
    let storage = env.storage().instance();
    let id: u64 = storage.get(&DataKey::NextTxId).unwrap_or(1);
    storage.set(&DataKey::NextTxId, &(id + 1));
    bump_instance(env);
    id
}


