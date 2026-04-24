//! Tests for Price Oracle Contract

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol};

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, PriceOracleContract);
    let admin = Address::generate(&env);
    let pusher = Address::generate(&env);
    (env, contract_id, admin, pusher)
}

#[test]
fn test_initialize() {
    let (env, contract_id, admin, _pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
#[should_panic]
fn test_initialize_twice_fails() {
    let (env, contract_id, admin, _pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    // Second call must panic with AlreadyInitialized
    client.initialize(&admin);
}

#[test]
fn test_add_and_remove_pusher() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);

    let pushers = client.get_pushers();
    assert_eq!(pushers.len(), 1);
    assert_eq!(pushers.get(0).unwrap(), pusher);

    client.remove_pusher(&admin, &pusher);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
#[should_panic]
fn test_add_duplicate_pusher_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);
    // Registering same pusher again must panic
    client.add_pusher(&admin, &pusher);
}

#[test]
#[should_panic]
fn test_remove_unknown_pusher_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    // pusher was never added
    client.remove_pusher(&admin, &pusher);
}

#[test]
fn test_push_and_get_price() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    // 1.234567 → scaled 1_234_567
    let price: i128 = 1_234_567;

    client.push_price(&pusher, &base, &quote, &price);

    let entry = client.get_price(&base, &quote);
    assert_eq!(entry.price, price);
    assert_eq!(entry.pusher, pusher);
}

#[test]
#[should_panic]
fn test_push_price_unauthorised_fails() {
    let (env, contract_id, admin, _pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    // not in pusher list
    let rogue = Address::generate(&env);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&rogue, &base, &quote, &1_000_000);
}

#[test]
fn test_twap_calculation() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    // Push two observations so TWAP can be computed
    client.push_price(&pusher, &base, &quote, &1_000_000);

    // Advance ledger time by 60 seconds
    env.ledger().with_mut(|li| {
        li.timestamp += 60;
    });

    client.push_price(&pusher, &base, &quote, &1_200_000);

    let twap = client.get_twap(&base, &quote);
    // TWAP must be between the two prices
    assert!(twap >= 1_000_000);
    assert!(twap <= 1_200_000);
}

#[test]
#[should_panic]
fn test_twap_insufficient_history_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    // Only one entry — TWAP should panic
    client.push_price(&pusher, &base, &quote, &1_000_000);
    client.get_twap(&base, &quote);
}

#[test]
fn test_price_history_bounded() {
    let (env, contract_id, admin, pusher) = setup();
    let client = PriceOracleContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    // Push more entries than TWAP_WINDOW_SIZE (10)
    for i in 0..15u32 {
        env.ledger().with_mut(|li| {
            li.timestamp += 10;
        });
        client.push_price(&pusher, &base, &quote, &(1_000_000 + i as i128));
    }

    let history = client.get_price_history(&base, &quote);
    // History must be capped at TWAP_WINDOW_SIZE
    assert_eq!(history.len(), 10);
}
