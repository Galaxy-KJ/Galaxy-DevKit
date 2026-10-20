//! Lifecycle events, so keepers and UIs can discover conditions without
//! scanning storage.

use super::*;
use soroban_sdk::{testutils::Events as _, FromVal, Val, Vec};

/// Events published by the swap contract itself.
fn swap_events(s: &Setup) -> Vec<(Vec<Val>, Val)> {
    let mut out = Vec::new(&s.env);
    for (contract, topics, data) in s.env.events().all().iter() {
        if contract == s.swap_id {
            out.push_back((topics, data));
        }
    }
    out
}

/// The latest swap-contract event, checked against `(name, owner)` topics.
/// Every earlier event must have a different name.
fn single_event<T: FromVal<Env, Val>>(s: &Setup, name: &str) -> T {
    let events = swap_events(s);
    let named = events
        .iter()
        .filter(|(topics, _)| {
            Symbol::from_val(&s.env, &topics.get(0).unwrap()) == Symbol::new(&s.env, name)
        })
        .count();
    assert_eq!(named, 1, "exactly one {name} event");
    let (topics, data) = events.last().unwrap();
    assert_eq!(topics.len(), 2);
    assert_eq!(
        Symbol::from_val(&s.env, &topics.get(0).unwrap()),
        Symbol::new(&s.env, name)
    );
    assert_eq!(Address::from_val(&s.env, &topics.get(1).unwrap()), s.owner);
    T::from_val(&s.env, &data)
}

#[test]
fn test_create_emits_created() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    let data: (u64, Address, Address, i128, u64) = single_event(&s, "created");
    assert_eq!(
        data,
        (
            id,
            s.source.address.clone(),
            s.destination.address.clone(),
            AMOUNT,
            NOW + 86_400,
        )
    );
}

#[test]
fn test_cancel_emits_cancelled() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.cancel(id);
    let data: (u64, i128) = single_event(&s, "cancelled");
    assert_eq!(data, (id, AMOUNT));
}

#[test]
fn test_expiry_emits_expired() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.env
        .ledger()
        .with_mut(|li| li.timestamp = NOW + 86_400 + 1);
    s.swap.execute_swap_condition(&id);
    let data: (u64, i128) = single_event(&s, "expired");
    assert_eq!(data, (id, AMOUNT));
}

#[test]
fn test_execute_emits_executed() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.set_market(1_200_000);
    s.swap.execute_swap_condition(&id);
    let data: (u64, i128, i128, i128) = single_event(&s, "executed");
    assert_eq!(data, (id, AMOUNT, 1_200_000, 1_200_000));
}
