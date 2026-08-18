//! Tests for Smart Swap Contract

use super::*;
use soroban_sdk::{
    testutils::{storage::Instance as _, Address as _, Ledger},
    Address, Env, Symbol,
};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
    
    // Test that contract is initialized
    // This would typically check storage values
}

#[test]
fn test_create_swap_condition() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
    
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
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
    
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
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
    
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
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);

    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);

    let ttl = env.as_contract(&contract_id, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_create_swap_condition_survives_past_initial_threshold() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);

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
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
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
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, SmartSwapContract);
    let client = SmartSwapContractClient::new(&env, &contract_id);
    let price_oracle = Address::generate(&env);
    client.initialize(&price_oracle);
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

