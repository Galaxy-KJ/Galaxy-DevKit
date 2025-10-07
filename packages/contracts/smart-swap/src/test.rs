//! Tests for Smart Swap Contract

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

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

