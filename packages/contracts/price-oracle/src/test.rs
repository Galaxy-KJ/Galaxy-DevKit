//! Comprehensive tests for the Price Oracle contract
//!
//! Coverage targets:
//!   • Lifecycle  (initialize, double-init, set_admin)
//!   • Pusher ACL (add, duplicate, remove, unknown, unauthorized)
//!   • Price push (happy-path, unauthorised, invalid range)
//!   • Price read  (get_price, history, TWAP, bounded window)
//!   • Staleness   (checked, strict-pass, strict-fail, exact boundary)
//!   • Multi-asset (get_all_prices, isolated pair histories)
//!   • Edge cases  (same-timestamp TWAP, exact window-size, i128 boundary)

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Bootstrap a fresh environment and deploy the contract.
fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, PriceOracleContract);
    let admin = Address::generate(&env);
    let pusher = Address::generate(&env);
    (env, contract_id, admin, pusher)
}

/// Initialise the contract and return a ready-to-use client.
fn init_client<'a>(
    env: &'a Env,
    contract_id: &'a Address,
    admin: &Address,
) -> PriceOracleContractClient<'a> {
    let client = PriceOracleContractClient::new(env, contract_id);
    client.initialize(admin);
    client
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_sets_admin_and_empty_state() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
#[should_panic]
fn test_initialize_twice_panics() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    // Second call must panic with AlreadyInitialized
    client.initialize(&admin);
}

#[test]
fn test_set_admin_transfers_rights() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);

    let new_admin = Address::generate(&env);
    client.set_admin(&new_admin);

    assert_eq!(client.get_admin(), new_admin);
}

// ---------------------------------------------------------------------------
// Pusher management
// ---------------------------------------------------------------------------

#[test]
fn test_add_pusher_registers_successfully() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    client.add_pusher(&admin, &pusher);

    let pushers = client.get_pushers();
    assert_eq!(pushers.len(), 1);
    assert_eq!(pushers.get(0).unwrap(), pusher);
}

#[test]
#[should_panic]
fn test_add_duplicate_pusher_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    client.add_pusher(&admin, &pusher);
    client.add_pusher(&admin, &pusher); // must panic
}

#[test]
fn test_add_multiple_pushers() {
    let (env, contract_id, admin, pusher1) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let pusher2 = Address::generate(&env);
    let pusher3 = Address::generate(&env);

    client.add_pusher(&admin, &pusher1);
    client.add_pusher(&admin, &pusher2);
    client.add_pusher(&admin, &pusher3);

    assert_eq!(client.get_pushers().len(), 3);
}

#[test]
fn test_remove_pusher_succeeds() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);

    client.add_pusher(&admin, &pusher);
    assert_eq!(client.get_pushers().len(), 1);

    client.remove_pusher(&admin, &pusher);
    assert_eq!(client.get_pushers().len(), 0);
}

#[test]
fn test_remove_one_of_many_pushers() {
    let (env, contract_id, admin, pusher1) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let pusher2 = Address::generate(&env);

    client.add_pusher(&admin, &pusher1);
    client.add_pusher(&admin, &pusher2);
    client.remove_pusher(&admin, &pusher1);

    let pushers = client.get_pushers();
    assert_eq!(pushers.len(), 1);
    assert_eq!(pushers.get(0).unwrap(), pusher2);
}

#[test]
#[should_panic]
fn test_remove_unknown_pusher_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    // pusher was never added
    client.remove_pusher(&admin, &pusher);
}

#[test]
#[should_panic]
fn test_add_pusher_by_non_admin_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let rogue = Address::generate(&env);
    // rogue is not the admin — must panic with Unauthorized
    client.add_pusher(&rogue, &pusher);
}

// ---------------------------------------------------------------------------
// Price submission
// ---------------------------------------------------------------------------

#[test]
fn test_push_and_get_price() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    let price: i128 = 1_234_567;

    client.push_price(&pusher, &base, &quote, &price);

    let entry = client.get_price(&base, &quote);
    assert_eq!(entry.price, price);
    assert_eq!(entry.pusher, pusher);
}

#[test]
#[should_panic]
fn test_push_price_unregistered_pusher_panics() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let rogue = Address::generate(&env);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&rogue, &base, &quote, &1_000_000);
}

#[test]
#[should_panic]
fn test_push_price_zero_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&pusher, &base, &quote, &0);
}

#[test]
#[should_panic]
fn test_push_price_negative_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&pusher, &base, &quote, &(-1_i128));
}

#[test]
#[should_panic]
fn test_push_price_exceeds_max_safe_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    // MAX_SAFE_PRICE + 1 must be rejected
    client.push_price(&pusher, &base, &quote, &(MAX_SAFE_PRICE + 1));
}

#[test]
fn test_push_price_at_max_safe_succeeds() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "BTC");
    let quote = Symbol::new(&env, "USD");
    client.push_price(&pusher, &base, &quote, &MAX_SAFE_PRICE);
    assert_eq!(client.get_price(&base, &quote).price, MAX_SAFE_PRICE);
}

#[test]
#[should_panic]
fn test_get_price_no_data_panics() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.get_price(&base, &quote);
}

// ---------------------------------------------------------------------------
// Price history & TWAP
// ---------------------------------------------------------------------------

#[test]
fn test_price_history_bounded_at_window_size() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    // Push 15 observations — 5 more than TWAP_WINDOW_SIZE (10)
    for i in 0..15u32 {
        env.ledger().with_mut(|li| li.timestamp += 10);
        client.push_price(&pusher, &base, &quote, &(1_000_000 + i as i128));
    }

    assert_eq!(client.get_price_history(&base, &quote).len(), 10);
}

#[test]
fn test_price_history_exact_window_size() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    for i in 0..10u32 {
        env.ledger().with_mut(|li| li.timestamp += 5);
        client.push_price(&pusher, &base, &quote, &(500_000 + i as i128));
    }

    assert_eq!(client.get_price_history(&base, &quote).len(), 10);
}

#[test]
fn test_twap_between_two_prices() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &1_000_000);
    env.ledger().with_mut(|li| li.timestamp += 60);
    client.push_price(&pusher, &base, &quote, &1_200_000);

    let twap = client.get_twap(&base, &quote);
    assert!(twap >= 1_000_000);
    assert!(twap <= 1_200_000);
}

#[test]
fn test_twap_same_timestamps_returns_average() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    // Both observations at the same ledger time → total_time == 0 path
    client.push_price(&pusher, &base, &quote, &1_000_000);
    client.push_price(&pusher, &base, &quote, &2_000_000);

    let twap = client.get_twap(&base, &quote);
    assert_eq!(twap, 1_500_000);
}

#[test]
#[should_panic]
fn test_twap_single_entry_panics() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&pusher, &base, &quote, &1_000_000);
    client.get_twap(&base, &quote);
}

#[test]
fn test_twap_multiple_observations() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    for i in 0..5u32 {
        env.ledger().with_mut(|li| li.timestamp += 30);
        client.push_price(&pusher, &base, &quote, &(1_000_000 + i as i128 * 100_000));
    }

    let twap = client.get_twap(&base, &quote);
    assert!(twap >= 1_000_000);
    assert!(twap <= 1_400_000);
}

// ---------------------------------------------------------------------------
// Staleness checks
// ---------------------------------------------------------------------------

#[test]
fn test_get_price_checked_fresh() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &1_000_000);
    // age = 0s; max_age = 300s → not stale
    let result = client.get_price_checked(&base, &quote, &300_u64);
    assert!(!result.is_stale);
    assert_eq!(result.age_seconds, 0);
    assert_eq!(result.entry.price, 1_000_000);
}

#[test]
fn test_get_price_checked_stale_flag() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &1_000_000);
    env.ledger().with_mut(|li| li.timestamp += 400);

    let result = client.get_price_checked(&base, &quote, &300_u64);
    assert!(result.is_stale);
    assert_eq!(result.age_seconds, 400);
}

#[test]
fn test_get_price_strict_passes_when_fresh() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &2_000_000);
    let entry = client.get_price_strict(&base, &quote, &600_u64);
    assert_eq!(entry.price, 2_000_000);
}

#[test]
#[should_panic]
fn test_get_price_strict_panics_when_stale() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &1_000_000);
    env.ledger().with_mut(|li| li.timestamp += 601);
    // max_age = 600s but 601s elapsed
    client.get_price_strict(&base, &quote, &600_u64);
}

#[test]
fn test_get_price_checked_exact_boundary_not_stale() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base, &quote, &1_000_000);
    // Exactly at the boundary → age == max_age, condition is age > max_age → false
    env.ledger().with_mut(|li| li.timestamp += 300);
    let result = client.get_price_checked(&base, &quote, &300_u64);
    assert!(!result.is_stale);
}

// ---------------------------------------------------------------------------
// Multi-asset feeds
// ---------------------------------------------------------------------------

#[test]
fn test_multiple_pairs_isolated() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let base_xlm = Symbol::new(&env, "XLM");
    let base_btc = Symbol::new(&env, "BTC");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher, &base_xlm, &quote, &1_000_000);
    client.push_price(&pusher, &base_btc, &quote, &60_000_000_000_i128);

    let xlm_entry = client.get_price(&base_xlm, &quote);
    let btc_entry = client.get_price(&base_btc, &quote);

    assert_eq!(xlm_entry.price, 1_000_000);
    assert_eq!(btc_entry.price, 60_000_000_000_i128);
}

#[test]
fn test_get_all_prices_contains_all_pairs() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);

    let pairs: &[(&str, &str, i128)] = &[
        ("XLM", "USDC", 1_000_000),
        ("BTC", "USDC", 60_000_000_000),
        ("ETH", "USDC", 3_000_000_000),
    ];

    for (b, q, p) in pairs {
        let base = Symbol::new(&env, b);
        let quote = Symbol::new(&env, q);
        client.push_price(&pusher, &base, &quote, p);
    }

    let all = client.get_all_prices();
    assert_eq!(all.len(), 3);
}

#[test]
fn test_get_all_prices_empty_initially() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let all = client.get_all_prices();
    assert_eq!(all.len(), 0);
}

#[test]
fn test_get_price_history_empty_for_unknown_pair() {
    let (env, contract_id, admin, _) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let base = Symbol::new(&env, "UNKNOWN");
    let quote = Symbol::new(&env, "ASSET");
    let history = client.get_price_history(&base, &quote);
    assert_eq!(history.len(), 0);
}

// ---------------------------------------------------------------------------
// Multiple pushers — individual auth
// ---------------------------------------------------------------------------

#[test]
fn test_two_pushers_both_can_push() {
    let (env, contract_id, admin, pusher1) = setup();
    let client = init_client(&env, &contract_id, &admin);
    let pusher2 = Address::generate(&env);
    client.add_pusher(&admin, &pusher1);
    client.add_pusher(&admin, &pusher2);

    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    client.push_price(&pusher1, &base, &quote, &1_000_000);
    env.ledger().with_mut(|li| li.timestamp += 30);
    client.push_price(&pusher2, &base, &quote, &1_100_000);

    // Most recent price should be from pusher2
    let entry = client.get_price(&base, &quote);
    assert_eq!(entry.price, 1_100_000);
    assert_eq!(entry.pusher, pusher2);
}

#[test]
#[should_panic]
fn test_removed_pusher_cannot_push() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    client.remove_pusher(&admin, &pusher);

    // Pusher is no longer registered — must panic
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");
    client.push_price(&pusher, &base, &quote, &1_000_000);
}

#[test]
fn test_price_latest_entry_after_multiple_pushes() {
    let (env, contract_id, admin, pusher) = setup();
    let client = init_client(&env, &contract_id, &admin);
    client.add_pusher(&admin, &pusher);
    let base = Symbol::new(&env, "XLM");
    let quote = Symbol::new(&env, "USDC");

    for i in 1..=5u32 {
        env.ledger().with_mut(|li| li.timestamp += 10);
        client.push_price(&pusher, &base, &quote, &(i as i128 * 1_000_000));
    }

    // get_price must return the most recent
    let entry = client.get_price(&base, &quote);
    assert_eq!(entry.price, 5_000_000);
}
