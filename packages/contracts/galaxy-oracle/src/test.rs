//! Unit tests for Galaxy Oracle contract

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, Symbol,
};

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, GalaxyOracleContract);
    let admin = Address::generate(&env);
    let pusher = Address::generate(&env);
    (env, contract_id, admin, pusher)
}

fn init_client<'a>(
    env: &'a Env,
    contract_id: &'a Address,
    admin: &Address,
) -> GalaxyOracleContractClient<'a> {
    let client = GalaxyOracleContractClient::new(env, contract_id);
    client.initialize(admin);
    client
}

// ---------------------------------------------------------------------------
// Lifecycle Tests
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_sets_admin() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
fn test_initialize_twice_fails() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let res = client.try_initialize(&admin);
    assert!(res.is_err());
}

#[test]
fn test_set_admin_transfers_ownership() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin);

    assert_eq!(client.get_admin(), new_admin);
}

// ---------------------------------------------------------------------------
// Pusher ACL Tests
// ---------------------------------------------------------------------------

#[test]
fn test_add_and_remove_pusher() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    client.add_pusher(&admin, &pusher);
    assert_eq!(client.get_pushers().len(), 1);
    assert_eq!(client.get_pushers().get(0).unwrap(), pusher);

    client.remove_pusher(&admin, &pusher);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
fn test_add_duplicate_pusher_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    client.add_pusher(&admin, &pusher);
    let res = client.try_add_pusher(&admin, &pusher);
    assert!(res.is_err());
}

#[test]
fn test_remove_nonexistent_pusher_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let res = client.try_remove_pusher(&admin, &pusher);
    assert!(res.is_err());
}

#[test]
fn test_unauthorized_add_pusher_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let imposter = Address::generate(&env);
    let res = client.try_add_pusher(&imposter, &pusher);
    assert!(res.is_err());
}

// ---------------------------------------------------------------------------
// Price Push & View Method Tests
// ---------------------------------------------------------------------------

#[test]
fn test_push_and_get_price() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    let price = 1250000; // $1.25

    env.ledger().with_mut(|l| l.timestamp = 1000);
    client.push_price(&pusher, &base, &quote, &price);

    let entry = client.get_price(&base, &quote);
    assert_eq!(entry.price, price);
    assert_eq!(entry.timestamp, 1000);
    assert_eq!(entry.pusher, pusher);
}

#[test]
fn test_unauthorized_push_price_fails() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let unauthorized_pusher = Address::generate(&env);
    let base = Symbol::new(&env, "BTC");
    let quote = Symbol::new(&env, "USDT");

    let res = client.try_push_price(&unauthorized_pusher, &base, &quote, &50000000000);
    assert!(res.is_err());
}

#[test]
fn test_invalid_price_zero_fails() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "ETH");
    let quote = Symbol::new(&env, "USD");

    let res = client.try_push_price(&pusher, &base, &quote, &0);
    assert!(res.is_err());
}

#[test]
fn test_get_price_nonexistent_pair_fails() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let base = Symbol::new(&env, "FOO");
    let quote = Symbol::new(&env, "BAR");

    let res = client.try_get_price(&base, &quote);
    assert!(res.is_err());
}

// ---------------------------------------------------------------------------
// Staleness & TWAP Tests
// ---------------------------------------------------------------------------

#[test]
fn test_price_staleness_check() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "SOL");
    let quote = Symbol::new(&env, "USD");

    env.ledger().with_mut(|l| l.timestamp = 1000);
    client.push_price(&pusher, &base, &quote, &150000000);

    // Fast-forward timestamp to 1200 (age 200s)
    env.ledger().with_mut(|l| l.timestamp = 1200);

    let checked = client.get_price_checked(&base, &quote, &150);
    assert_eq!(checked.age_seconds, 200);
    assert!(checked.is_stale);

    let checked_valid = client.get_price_checked(&base, &quote, &300);
    assert_eq!(checked_valid.age_seconds, 200);
    assert!(!checked_valid.is_stale);
}

#[test]
fn test_twap_computation() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    env.ledger().with_mut(|l| l.timestamp = 1000);
    client.push_price(&pusher, &base, &quote, &1000000);

    env.ledger().with_mut(|l| l.timestamp = 1100);
    client.push_price(&pusher, &base, &quote, &2000000);

    env.ledger().with_mut(|l| l.timestamp = 1200);

    let twap = client.get_twap(&base, &quote);
    assert_eq!(twap, 1500000);
}

// ---------------------------------------------------------------------------
// Multi-Asset Test
// ---------------------------------------------------------------------------

#[test]
fn test_get_all_prices() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let xlm = Symbol::new(&env, "XLM");
    let usdc = Symbol::new(&env, "USDC");
    let btc = Symbol::new(&env, "BTC");

    client.push_price(&pusher, &xlm, &usdc, &1200000);
    client.push_price(&pusher, &btc, &usdc, &60000000000);

    let all_prices = client.get_all_prices();
    assert_eq!(all_prices.len(), 2);
}
