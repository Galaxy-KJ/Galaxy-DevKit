//! Tests for Smart Swap Contract

use super::*;
use soroban_sdk::{
    testutils::{storage::Instance as _, Address as _, Ledger},
    testutils::{MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, Symbol,
};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    // Test that contract is initialized
    // This would typically check storage values
}

#[test]
fn test_create_swap_condition() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    let owner = Address::generate(&env);
    let source_asset = Symbol::short("XLM");
    let destination_asset = Symbol::short("USDC");
    let condition_type = SwapConditionType::PriceAbove(1000);
    let amount_to_swap = 1000;
    let min_amount_out = 950;
    let max_slippage = 5;
    let expires_at = 1000000;

    let condition_id = client.create_swap_condition(
        &owner,
        &source_asset,
        &destination_asset,
        &condition_type,
        &amount_to_swap,
        &min_amount_out,
        &max_slippage,
        &expires_at,
    );

    assert_eq!(condition_id, 1);
}

#[test]
fn test_get_active_conditions() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    let owner = Address::generate(&env);
    let source_asset = Symbol::short("XLM");
    let destination_asset = Symbol::short("USDC");
    let condition_type = SwapConditionType::PriceAbove(1000);
    let amount_to_swap = 1000;
    let min_amount_out = 950;
    let max_slippage = 5;
    let expires_at = 1000000;

    client.create_swap_condition(
        &owner,
        &source_asset,
        &destination_asset,
        &condition_type,
        &amount_to_swap,
        &min_amount_out,
        &max_slippage,
        &expires_at,
    );

    let active_conditions = client.get_active_conditions(&owner);
    assert_eq!(active_conditions.len(), 1);
}

#[test]
fn test_cancel_condition() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    let owner = Address::generate(&env);
    let source_asset = Symbol::short("XLM");
    let destination_asset = Symbol::short("USDC");
    let condition_type = SwapConditionType::PriceAbove(1000);
    let amount_to_swap = 1000;
    let min_amount_out = 950;
    let max_slippage = 5;
    let expires_at = 1000000;

    let condition_id = client.create_swap_condition(
        &owner,
        &source_asset,
        &destination_asset,
        &condition_type,
        &amount_to_swap,
        &min_amount_out,
        &max_slippage,
        &expires_at,
    );

    client.cancel_condition(&condition_id, &owner);

    let active_conditions = client.get_active_conditions(&owner);
    assert_eq!(active_conditions.len(), 0);
}

// ---------------------------------------------------------------------------
// TTL — instance storage survivability and exact boundary behavior
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_extends_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_create_swap_condition_survives_past_initial_threshold() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    let owner = Address::generate(&env);
    client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(1000),
        &1000,
        &950,
        &5,
        &1_000_000,
    );

    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_instance_ttl_boundary_behavior() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);
    let owner = Address::generate(&env);

    let just_before_threshold = 100 + (INSTANCE_TTL_EXTEND - INSTANCE_TTL_THRESHOLD - 1);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(1000),
        &1000,
        &950,
        &5,
        &1_000_000,
    );
    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(
        ttl,
        INSTANCE_TTL_THRESHOLD + 1,
        "must not re-extend before threshold"
    );

    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceBelow(2000),
        &1000,
        &950,
        &5,
        &1_000_000,
    );
    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND, "must re-extend at/past threshold");
}

#[test]
fn test_cancel_condition_extends_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&admin, &price_oracle);
    let owner = Address::generate(&env);

    let condition_id = client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(1000),
        &1000,
        &950,
        &5,
        &1_000_000,
    );

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    client.cancel_condition(&condition_id, &owner);

    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn initialize_twice_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    c.initialize(&admin, &oracle);
    let err = c
        .try_initialize(&admin, &Address::generate(&env))
        .unwrap_err();
    assert_eq!(err.ok(), Some(SmartSwapError::AlreadyInitialized));
}

#[test]
#[should_panic]
fn initialize_without_admin_auth_fails() {
    let env = Env::default();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
}

#[test]
#[should_panic]
fn attacker_cannot_create_for_other_owner() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let attacker = Address::generate(&env);
    let source = Symbol::short("XLM");
    let destination = Symbol::short("USDC");
    let condition_type = SwapConditionType::PriceAbove(100);
    // Only the attacker authorizes this exact invocation, not the owner.
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "create_swap_condition",
            args: (
                owner.clone(),
                source.clone(),
                destination.clone(),
                condition_type.clone(),
                100u64,
                90u64,
                5u32,
                1_000_000u64,
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    c.create_swap_condition(
        &owner,
        &source,
        &destination,
        &condition_type,
        &100,
        &90,
        &5,
        &1_000_000,
    );
}

#[test]
#[should_panic]
fn attacker_cannot_cancel_other_owner_condition() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let condition = c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    let attacker = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &id,
            fn_name: "cancel_condition",
            args: (condition, owner.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    c.cancel_condition(&condition, &owner);
}

#[test]
#[should_panic]
fn attacker_cannot_change_oracle() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    env.mock_auths(&[]);
    c.set_oracle(&Address::generate(&env));
}

#[test]
fn conditions_use_separate_persistent_entries() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let first = c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    let second = c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    assert_ne!(first, second);
    assert_eq!(c.get_active_conditions(&owner).len(), 2);
    env.as_contract(&id, || {
        let storage = env.storage().persistent();
        assert!(storage.has(&DataKey::Condition(first)));
        assert!(storage.has(&DataKey::Condition(second)));
        assert!(storage.get_ttl(&DataKey::Condition(first)) > 0);
        assert!(storage.has(&DataKey::OwnerConditions(owner.clone())));
    });
    c.cancel_condition(&first, &owner);
    assert_eq!(c.get_active_conditions(&owner).len(), 1);
}

#[test]
fn terminal_conditions_are_pruned_from_owner_index() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let create = |kind: SwapConditionType| {
        c.create_swap_condition(
            &owner,
            &Symbol::short("XLM"),
            &Symbol::short("USDC"),
            &kind,
            &100,
            &90,
            &5,
            &1_000_000,
        )
    };
    let cancelled = create(SwapConditionType::PriceAbove(100));
    let executed = create(SwapConditionType::PriceAbove(100));
    let active = create(SwapConditionType::PriceBelow(100));
    c.cancel_condition(&cancelled, &owner);
    c.execute_swap_condition(&executed);
    env.as_contract(&id, || {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerConditions(owner.clone()))
            .unwrap();
        assert_eq!(ids.len(), 1);
        assert_eq!(ids.get(0), Some(active));
    });
    assert_eq!(c.get_active_conditions(&owner).len(), 1);
}
#[test]
fn test_execute_swap_condition_at_expiration_boundary() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let price_oracle = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin, &price_oracle);

    let expires_at = 1_000_000;

    let condition_id = client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &expires_at,
    );

    env.ledger().with_mut(|li| {
        li.timestamp = expires_at;
    });

    let result = client.try_execute_swap_condition(&condition_id);

    assert_eq!(result, Err(Ok(SmartSwapError::ConditionExpired)));
}

#[test]
fn reading_active_conditions_renews_record_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let condition = c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    env.ledger().with_mut(|li| {
        li.sequence_number = 100 + PERSISTENT_TTL_EXTEND - PERSISTENT_TTL_THRESHOLD + 1;
    });
    assert_eq!(c.get_active_conditions(&owner).len(), 1);
    let ttl = env.as_contract(&id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Condition(condition))
    });
    assert_eq!(ttl, PERSISTENT_TTL_EXTEND);
}

#[test]
fn expired_conditions_are_not_returned_as_active() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &100,
    );
    env.ledger().set_timestamp(100);
    assert!(c.get_active_conditions(&owner).is_empty());
}

#[test]
fn new_creation_renews_older_indexed_record_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let id = env.register_contract(None, SmartSwapContract);
    let c = SmartSwapContractClient::new(&env, &id);
    c.initialize(&Address::generate(&env), &Address::generate(&env));
    let owner = Address::generate(&env);
    let first = c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    env.ledger().with_mut(|li| {
        li.sequence_number = 100 + PERSISTENT_TTL_EXTEND - PERSISTENT_TTL_THRESHOLD + 1;
    });
    c.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &1_000_000,
    );
    let ttl = env.as_contract(&id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Condition(first))
    });
    assert_eq!(ttl, PERSISTENT_TTL_EXTEND);
}

#[test]
fn expired_conditions_are_pruned_from_owner_index() {
    let env = Env::default();
    env.mock_all_auths();

    env.ledger().with_mut(|li| {
        li.timestamp = 100;
        li.sequence_number = 100;
    });

    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let owner = Address::generate(&env);

    client.initialize(&admin, &oracle);

    let first = client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &200,
    );

    // Move past the first condition's expiration.
    env.ledger().with_mut(|li| {
        li.timestamp = 201;
    });

    // Creating another condition should prune the expired ID.
    let second = client.create_swap_condition(
        &owner,
        &Symbol::short("XLM"),
        &Symbol::short("USDC"),
        &SwapConditionType::PriceAbove(100),
        &100,
        &90,
        &5,
        &300,
    );

    let ids: Vec<u64> = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerConditions(owner.clone()))
            .unwrap()
    });

    assert_eq!(ids.len(), 1);
    assert_eq!(ids.get(0), Some(second));
    assert_ne!(first, second);
}
