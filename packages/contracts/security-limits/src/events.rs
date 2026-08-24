//! Contract events. Topics are `(name, owner, asset)` so indexers can filter per account.

use soroban_sdk::{Address, BytesN, Env, Symbol};

fn topics(env: &Env, name: &str, owner: &Address, asset: &Symbol) -> (Symbol, Address, Symbol) {
    (Symbol::new(env, name), owner.clone(), asset.clone())
}

pub fn limit_created(env: &Env, owner: &Address, asset: &Symbol, limit_id: u64) {
    env.events()
        .publish(topics(env, "limit_created", owner, asset), limit_id);
}

pub fn limit_updated(env: &Env, owner: &Address, asset: &Symbol, limit_id: u64) {
    env.events()
        .publish(topics(env, "limit_updated", owner, asset), limit_id);
}

pub fn limit_deleted(env: &Env, owner: &Address, asset: &Symbol, limit_id: u64) {
    env.events()
        .publish(topics(env, "limit_deleted", owner, asset), limit_id);
}

/// `profile_set` keeps the same topic arity. The asset topic is the literal `PROFILE`.
pub fn profile_set(env: &Env, owner: &Address) {
    let asset = Symbol::new(env, "PROFILE");
    env.events()
        .publish(topics(env, "profile_set", owner, &asset), owner.clone());
}

pub fn tx_recorded(
    env: &Env,
    owner: &Address,
    asset: &Symbol,
    amount: u64,
    tx_hash: &BytesN<32>,
    tx_id: u64,
) {
    env.events().publish(
        topics(env, "tx_recorded", owner, asset),
        (tx_id, amount, tx_hash.clone()),
    );
}

pub fn limit_breached(env: &Env, owner: &Address, asset: &Symbol, reason: u32, amount: u64) {
    env.events()
        .publish(topics(env, "limit_breached", owner, asset), (reason, amount));
}
