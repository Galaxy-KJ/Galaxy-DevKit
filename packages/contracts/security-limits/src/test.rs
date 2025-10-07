//! Tests for Security Limits Contract

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, BytesN};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    // Test that contract is initialized
    // This would typically check storage values
}

#[test]
fn test_create_security_limit() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    let owner = Address::generate(&env);
    let limit_type = LimitType::Daily;
    let asset = Symbol::short("XLM");
    let max_amount = 10000;
    let time_window = 86400;
    
    let limit_id = client.create_security_limit(
        &owner,
        &limit_type,
        &asset,
        &max_amount,
        &time_window,
    );
    
    assert_eq!(limit_id, 1);
}

#[test]
fn test_check_transaction_allowed() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    let owner = Address::generate(&env);
    let asset = Symbol::short("XLM");
    let limit_type = LimitType::Daily;
    let max_amount = 10000;
    let time_window = 86400;
    
    client.create_security_limit(
        &owner,
        &limit_type,
        &asset,
        &max_amount,
        &time_window,
    );
    
    // Test transaction within limit
    let allowed = client.check_transaction_allowed(&owner, &asset, &5000);
    assert!(allowed);
    
    // Test transaction exceeding limit
    let allowed = client.check_transaction_allowed(&owner, &asset, &15000);
    assert!(!allowed);
}

#[test]
fn test_record_transaction() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    let owner = Address::generate(&env);
    let asset = Symbol::short("XLM");
    let amount = 1000;
    let tx_hash = BytesN::from_array(&env, &[1u8; 32]);
    
    let tx_id = client.record_transaction(&owner, &asset, &amount, &tx_hash);
    assert_eq!(tx_id, 1);
}

#[test]
fn test_set_risk_profile() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    let owner = Address::generate(&env);
    let risk_level = RiskLevel::Medium;
    let max_daily_volume = 50000;
    let max_single_transaction = 10000;
    let allowed_assets = vec![&env, Symbol::short("XLM"), Symbol::short("USDC")];
    let blacklisted_assets = vec![&env, Symbol::short("SCAM")];
    
    client.set_risk_profile(
        &owner,
        &risk_level,
        &max_daily_volume,
        &max_single_transaction,
        &allowed_assets,
        &blacklisted_assets,
    );
    
    let profile = client.get_risk_profile(&owner);
    assert!(profile.is_some());
    assert_eq!(profile.unwrap().risk_level, RiskLevel::Medium);
}

#[test]
fn test_is_asset_allowed() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let client = SecurityLimitsContractClient::new(&env, &contract_id);
    
    client.initialize();
    
    let owner = Address::generate(&env);
    let allowed_asset = Symbol::short("XLM");
    let blacklisted_asset = Symbol::short("SCAM");
    
    // Set risk profile with allowed and blacklisted assets
    let risk_level = RiskLevel::Medium;
    let max_daily_volume = 50000;
    let max_single_transaction = 10000;
    let allowed_assets = vec![&env, allowed_asset.clone()];
    let blacklisted_assets = vec![&env, blacklisted_asset.clone()];
    
    client.set_risk_profile(
        &owner,
        &risk_level,
        &max_daily_volume,
        &max_single_transaction,
        &allowed_assets,
        &blacklisted_assets,
    );
    
    // Test allowed asset
    let allowed = client.is_asset_allowed(&owner, &allowed_asset);
    assert!(allowed);
    
    // Test blacklisted asset
    let allowed = client.is_asset_allowed(&owner, &blacklisted_asset);
    assert!(!allowed);
}

