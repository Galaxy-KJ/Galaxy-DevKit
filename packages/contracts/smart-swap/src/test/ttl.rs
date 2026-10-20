//! TTL: instance storage survivability and exact boundary behavior.

use super::*;
use crate::{INSTANCE_TTL_EXTEND, INSTANCE_TTL_THRESHOLD};
use soroban_sdk::testutils::storage::Instance as _;

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
    s.swap.cancel_condition(&condition_id, &s.owner);

    assert_eq!(instance_ttl(&s), INSTANCE_TTL_EXTEND);
}
