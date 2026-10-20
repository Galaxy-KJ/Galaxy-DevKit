//! TTL: instance storage survivability and exact boundary behavior.

use super::*;
use crate::{DataKey, INSTANCE_TTL_EXTEND, INSTANCE_TTL_THRESHOLD};
use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};

fn instance_ttl(s: &Setup) -> u32 {
    s.env
        .as_contract(&s.swap_id, || s.env.storage().instance().get_ttl())
}

#[test]
fn test_initialize_extends_instance_ttl() {
    let s = Setup::new();
    assert_eq!(instance_ttl(&s), INSTANCE_TTL_EXTEND);
}

#[test]
fn test_create_swap_condition_survives_past_initial_threshold() {
    let s = Setup::new();

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    s.create(SwapConditionType::PriceAbove(1000));

    assert_eq!(instance_ttl(&s), INSTANCE_TTL_EXTEND);
}

#[test]
fn test_instance_ttl_boundary_behavior() {
    let s = Setup::new();

    let just_before_threshold = 100 + (INSTANCE_TTL_EXTEND - INSTANCE_TTL_THRESHOLD - 1);
    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    s.create(SwapConditionType::PriceAbove(1000));
    assert_eq!(
        instance_ttl(&s),
        INSTANCE_TTL_THRESHOLD + 1,
        "must not re-extend before threshold"
    );

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    s.create(SwapConditionType::PriceBelow(2000));
    assert_eq!(
        instance_ttl(&s),
        INSTANCE_TTL_EXTEND,
        "must re-extend at/past threshold"
    );
}

#[test]
fn test_cancel_condition_extends_instance_ttl() {
    let s = Setup::new();
    let condition_id = s.create(SwapConditionType::PriceAbove(1000));

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    s.cancel(condition_id);

    assert_eq!(instance_ttl(&s), INSTANCE_TTL_EXTEND);
}

// ---------------------------------------------------------------------------
// Persistent per-condition storage
// ---------------------------------------------------------------------------

fn persistent_ttl(s: &Setup, key: &DataKey) -> u32 {
    s.env
        .as_contract(&s.swap_id, || s.env.storage().persistent().get_ttl(key))
}

fn has_persistent(s: &Setup, key: &DataKey) -> bool {
    s.env
        .as_contract(&s.swap_id, || s.env.storage().persistent().has(key))
}

fn instance_len(s: &Setup) -> u32 {
    s.env
        .as_contract(&s.swap_id, || s.env.storage().instance().all().len())
}

#[test]
fn test_instance_storage_does_not_grow_with_conditions() {
    let s = Setup::new();
    s.create(SwapConditionType::PriceAbove(1_100_000));
    let keys_after_one = instance_len(&s);

    for _ in 0..8 {
        s.create(SwapConditionType::PriceAbove(1_100_000));
    }

    assert_eq!(instance_len(&s), keys_after_one);
    assert_eq!(keys_after_one, 2, "only CONFIG and NEXT_ID");
    for id in 1..=9u64 {
        assert!(has_persistent(&s, &DataKey::Condition(id)));
    }
}

#[test]
fn test_condition_entry_ttl_is_extended_on_write_and_read() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    let key = DataKey::Condition(id);
    assert_eq!(persistent_ttl(&s, &key), INSTANCE_TTL_EXTEND);
    assert_eq!(
        persistent_ttl(&s, &DataKey::OwnerConditions(s.owner.clone())),
        INSTANCE_TTL_EXTEND
    );

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    s.swap.get_condition(&id);
    assert_eq!(persistent_ttl(&s, &key), INSTANCE_TTL_EXTEND);
}

#[test]
fn test_execution_entry_ttl_is_extended_on_write_and_read() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1));
    assert!(s.swap.get_execution_history(&id).is_empty());
    s.swap.execute_swap_condition(&id);
    let key = DataKey::Execution(id);
    assert_eq!(persistent_ttl(&s, &key), INSTANCE_TTL_EXTEND);

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    assert_eq!(s.swap.get_execution_history(&id).len(), 1);
    assert_eq!(persistent_ttl(&s, &key), INSTANCE_TTL_EXTEND);
}

#[test]
fn test_owner_index_keeps_only_active_ids() {
    let s = Setup::new();
    let executed = s.create(SwapConditionType::PriceAbove(1));
    let cancelled = s.create(SwapConditionType::PriceAbove(1));
    let expired = s.create(SwapConditionType::PriceAbove(5_000_000));
    let active = s.create(SwapConditionType::PriceAbove(5_000_000));

    s.swap.execute_swap_condition(&executed);
    s.cancel(cancelled);
    let index = DataKey::OwnerConditions(s.owner.clone());
    let ids: soroban_sdk::Vec<u64> = s.env.as_contract(&s.swap_id, || {
        s.env.storage().persistent().get(&index).unwrap()
    });
    assert_eq!(ids, soroban_sdk::vec![&s.env, expired, active]);

    s.env
        .ledger()
        .with_mut(|li| li.timestamp = NOW + 86_400 + 1);
    s.swap.execute_swap_condition(&expired);
    let active_conditions = s.swap.get_active_conditions(&s.owner);
    assert_eq!(active_conditions.len(), 1);
    assert_eq!(active_conditions.get(0).unwrap().id, active);

    s.swap.execute_swap_condition(&active);
    assert!(s.swap.get_active_conditions(&s.owner).is_empty());
    assert!(!has_persistent(&s, &index), "empty index is removed");
}
