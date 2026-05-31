//! Tests for the Yield Vault contract.

use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, vec, Address, Env, Symbol};

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, YieldVaultContract);
    let admin = Address::generate(&env);
    let asset = Address::generate(&env);
    (env, contract_id, admin, asset)
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

#[test]
fn test_initialize() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);

    client.initialize(&admin, &asset);

    let info = client.get_vault_info();
    assert_eq!(info.admin, admin);
    assert_eq!(info.asset, asset);
    assert_eq!(info.total_shares, 0);
    assert_eq!(info.total_assets, 0);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);

    client.initialize(&admin, &asset);
    client.initialize(&admin, &asset); // must panic
}

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_first_user_gets_1_to_1_shares() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    let shares = client.deposit(&user, &1_000_0000000u64); // 1 000 units (7 dp)

    assert_eq!(shares, 1_000_0000000u64);
    assert_eq!(client.get_balance(&user), 1_000_0000000u64);
    assert_eq!(client.get_total_value_locked(), 1_000_0000000u64);
}

#[test]
fn test_deposit_second_user_proportional_shares() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    client.deposit(&user1, &1_000u64);
    // Harvest 1 000 yield → total_assets = 2 000, total_shares = 1 000
    client.harvest(&1_000u64);

    // user2 deposits 1 000 → shares = 1000 * 1000 / 2000 = 500
    let shares2 = client.deposit(&user2, &1_000u64);
    assert_eq!(shares2, 500u64);
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_deposit_zero_panics() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &0u64);
}

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_full_balance() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    let deposited = 1_000u64;
    let shares = client.deposit(&user, &deposited);

    let result = client.withdraw(&user, &shares);
    assert_eq!(result.shares_burned, shares);
    assert_eq!(result.assets_returned, deposited);
    assert_eq!(client.get_balance(&user), 0);
    assert_eq!(client.get_total_value_locked(), 0);
}

#[test]
fn test_withdraw_with_accrued_yield() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &1_000u64);

    // Harvest 200 units of yield
    client.harvest(&200u64);

    // User holds all shares → should receive 1 200 back
    let shares = client.get_balance(&user);
    let result = client.withdraw(&user, &shares);
    assert_eq!(result.assets_returned, 1_200u64);
}

#[test]
#[should_panic(expected = "insufficient shares")]
fn test_withdraw_more_than_balance_panics() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &500u64);
    client.withdraw(&user, &1_000u64); // more than deposited
}

#[test]
#[should_panic(expected = "vault is empty")]
fn test_withdraw_from_empty_vault_panics() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.withdraw(&user, &100u64);
}

// ---------------------------------------------------------------------------
// Harvest / auto-compounding
// ---------------------------------------------------------------------------

#[test]
fn test_harvest_increases_share_value() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &1_000u64);

    let value_before = client.get_share_value();
    client.harvest(&500u64);
    let value_after = client.get_share_value();

    assert!(value_after > value_before);
}

#[test]
fn test_harvest_updates_last_harvest_timestamp() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &1_000u64);

    let info_before = client.get_vault_info();
    // Advance ledger time
    env.ledger().with_mut(|l| l.timestamp += 3600);
    client.harvest(&100u64);
    let info_after = client.get_vault_info();

    assert!(info_after.last_harvest > info_before.last_harvest);
}

// ---------------------------------------------------------------------------
// Share accounting – multiple users
// ---------------------------------------------------------------------------

#[test]
fn test_multiple_deposits_share_accounting() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    // All deposit equal amounts before any yield → equal shares
    client.deposit(&user1, &1_000u64);
    client.deposit(&user2, &1_000u64);
    client.deposit(&user3, &1_000u64);

    assert_eq!(client.get_balance(&user1), client.get_balance(&user2));
    assert_eq!(client.get_balance(&user2), client.get_balance(&user3));
    assert_eq!(client.get_total_value_locked(), 3_000u64);
}

// ---------------------------------------------------------------------------
// Strategy management
// ---------------------------------------------------------------------------

#[test]
fn test_set_and_get_strategies() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let blend_addr = Address::generate(&env);
    let soroswap_addr = Address::generate(&env);

    let strategies = vec![
        &env,
        StrategyAllocation {
            name: Symbol::new(&env, "blend_usdc"),
            strategy_type: StrategyType::Blend,
            contract_address: blend_addr,
            weight_bps: 6_000,
            active: true,
        },
        StrategyAllocation {
            name: Symbol::new(&env, "soroswap_xlm"),
            strategy_type: StrategyType::Soroswap,
            contract_address: soroswap_addr,
            weight_bps: 4_000,
            active: true,
        },
    ];

    client.set_strategies(&strategies);

    let stored = client.get_strategies();
    assert_eq!(stored.len(), 2);
}

#[test]
#[should_panic(expected = "active strategy weights must sum to 10000 bps")]
fn test_set_strategies_invalid_weights_panics() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let addr = Address::generate(&env);
    let bad_strategies = vec![
        &env,
        StrategyAllocation {
            name: Symbol::new(&env, "blend_usdc"),
            strategy_type: StrategyType::Blend,
            contract_address: addr,
            weight_bps: 5_000, // only 50 % – invalid
            active: true,
        },
    ];

    client.set_strategies(&bad_strategies);
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

#[test]
fn test_get_share_value_empty_vault_returns_zero() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    assert_eq!(client.get_share_value(), 0);
}

#[test]
fn test_get_share_value_after_deposit() {
    let (env, contract_id, admin, asset) = setup();
    let client = YieldVaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &asset);

    let user = Address::generate(&env);
    client.deposit(&user, &10_000_000u64); // 1 unit (7 dp)

    // 1:1 ratio → share value = 1e7 (scaled by 1e7)
    assert_eq!(client.get_share_value(), 10_000_000u64);
}
