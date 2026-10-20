//! Condition lifecycle events. Topics are `(name, owner)` so indexers and
//! keepers can follow one account or every condition.

use soroban_sdk::{symbol_short, Address, Env, Symbol};

const CREATED: Symbol = symbol_short!("created");
const CANCELLED: Symbol = symbol_short!("cancelled");
const EXPIRED: Symbol = symbol_short!("expired");
const EXECUTED: Symbol = symbol_short!("executed");

/// Data: `(condition_id, source_token, destination_token, amount_to_swap, expires_at)`.
pub fn created(
    env: &Env,
    owner: &Address,
    condition_id: u64,
    source_token: &Address,
    destination_token: &Address,
    amount_to_swap: i128,
    expires_at: u64,
) {
    env.events().publish(
        (CREATED, owner.clone()),
        (
            condition_id,
            source_token.clone(),
            destination_token.clone(),
            amount_to_swap,
            expires_at,
        ),
    );
}

/// Data: `(condition_id, refunded_amount)`.
pub fn cancelled(env: &Env, owner: &Address, condition_id: u64, refunded: i128) {
    env.events()
        .publish((CANCELLED, owner.clone()), (condition_id, refunded));
}

/// Data: `(condition_id, refunded_amount)`.
pub fn expired(env: &Env, owner: &Address, condition_id: u64, refunded: i128) {
    env.events()
        .publish((EXPIRED, owner.clone()), (condition_id, refunded));
}

/// Data: `(condition_id, amount_in, amount_out, price)`.
pub fn executed(
    env: &Env,
    owner: &Address,
    condition_id: u64,
    amount_in: i128,
    amount_out: i128,
    price: i128,
) {
    env.events().publish(
        (EXECUTED, owner.clone()),
        (condition_id, amount_in, amount_out, price),
    );
}
