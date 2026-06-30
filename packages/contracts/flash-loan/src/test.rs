//! Unit tests for the Flash Loan contract.
//!
//! Coverage:
//!   • Lifecycle     (initialize, double-init)
//!   • Fee logic     (default, set_fee, get_fee, ceiling division, boundaries)
//!   • Input guards  (zero amount, negative amount, token mismatch)
//!   • Liquidity     (deposit, deposit zero/negative, withdraw, withdraw zero/negative)
//!   • View helpers  (get_pool_info, get_fee)
//!
//! Note on flash_loan end-to-end tests
//! ------------------------------------
//! Full flash-loan execution requires a live cross-contract receiver callback.
//! The repayment-invariant and callback tests belong in an integration-test
//! crate (e.g. `tests/flash_loan_integration.rs`).  The unit tests here cover
//! all guard paths that can be exercised without a callback.

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Bytes, Env};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup(env: &Env) -> (Address, FlashLoanContractClient, Address, token::Client, Address) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let (token_addr, token_client) = make_token(env, &admin);
    let sac_admin = token::StellarAssetClient::new(env, &token_addr);
    sac_admin.mint(&admin, &1_000_000_i128);

    let flash_loan_id = env.register_contract(None, FlashLoanContract);
    let client = FlashLoanContractClient::new(env, &flash_loan_id);
    client.initialize(&admin, &token_addr);

    (flash_loan_id, client, token_addr, token_client, admin)
}

fn make_token<'a>(env: &'a Env, admin: &Address) -> (Address, token::Client<'a>) {
    let id = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = id.address();
    let client = token::Client::new(env, &addr);
    (addr, client)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_sets_token_and_default_fee() {
    let env = Env::default();
    let (_, client, token_addr, _, admin) = setup(&env);

    let info = client.get_pool_info();
    assert_eq!(info.admin, admin);
    assert_eq!(info.token, token_addr);
    assert_eq!(info.fee_bps, DEFAULT_FEE_BPS);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_double_initialize_panics() {
    let env = Env::default();
    let (_, client, token_addr, _, admin) = setup(&env);
    client.initialize(&admin, &token_addr);
}

// ---------------------------------------------------------------------------
// Fee management
// ---------------------------------------------------------------------------

#[test]
fn test_default_fee_bps_is_9() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    assert_eq!(DEFAULT_FEE_BPS, 9);
    assert_eq!(client.get_pool_info().fee_bps, 9);
}

#[test]
fn test_set_fee_updates_stored_bps() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&50_i128);
    assert_eq!(client.get_pool_info().fee_bps, 50);
}

#[test]
fn test_set_fee_zero_is_allowed() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&0_i128);
    assert_eq!(client.get_pool_info().fee_bps, 0);
}

#[test]
fn test_set_fee_10000_is_allowed() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&10_000_i128);
    assert_eq!(client.get_pool_info().fee_bps, 10_000);
}

#[test]
#[should_panic(expected = "fee_bps must be between 0 and 10000")]
fn test_set_fee_above_10000_panics() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&10_001_i128);
}

#[test]
#[should_panic(expected = "fee_bps must be between 0 and 10000")]
fn test_set_fee_negative_panics() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&(-1_i128));
}

// ---------------------------------------------------------------------------
// get_fee – ceiling division
// ---------------------------------------------------------------------------

#[test]
fn test_get_fee_exact_multiple() {
    // 10_000 * 9 / 10_000 = 9.000 – no rounding needed
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    assert_eq!(client.get_fee(&10_000_i128), 9);
}

#[test]
fn test_get_fee_small_amount_rounds_up_to_1() {
    // 1 * 9 = 9; 9 / 10_000 = 0.0009 → ceil = 1
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    assert_eq!(client.get_fee(&1_i128), 1);
}

#[test]
fn test_get_fee_large_amount() {
    // 1_000_000 * 9 / 10_000 = 900 exactly
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    assert_eq!(client.get_fee(&1_000_000_i128), 900);
}

#[test]
fn test_get_fee_zero_bps_returns_zero() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.set_fee(&0_i128);
    assert_eq!(client.get_fee(&999_999_i128), 0);
}

#[test]
fn test_get_fee_reflects_updated_bps() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    // Default: 9 bps → 100_000 * 9 / 10_000 = 90
    assert_eq!(client.get_fee(&100_000_i128), 90);
    // Update to 30 bps → 100_000 * 30 / 10_000 = 300
    client.set_fee(&30_i128);
    assert_eq!(client.get_fee(&100_000_i128), 300);
}

// ---------------------------------------------------------------------------
// Flash loan – input validation guards
// (These fire before any token transfer or callback, so no receiver needed.)
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_flash_loan_zero_amount_reverts() {
    let env = Env::default();
    let (_, client, token_addr, _, admin) = setup(&env);
    client.deposit(&admin, &500_000_i128);
    client.flash_loan(&admin, &token_addr, &0_i128, &Bytes::new(&env));
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_flash_loan_negative_amount_reverts() {
    let env = Env::default();
    let (_, client, token_addr, _, admin) = setup(&env);
    client.deposit(&admin, &500_000_i128);
    client.flash_loan(&admin, &token_addr, &(-1_i128), &Bytes::new(&env));
}

#[test]
#[should_panic(expected = "token mismatch")]
fn test_flash_loan_wrong_token_reverts() {
    let env = Env::default();
    let (_, client, _, _, admin) = setup(&env);
    client.deposit(&admin, &500_000_i128);
    let wrong_token = Address::generate(&env);
    client.flash_loan(&admin, &wrong_token, &1_000_i128, &Bytes::new(&env));
}

// ---------------------------------------------------------------------------
// Liquidity – deposit
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_increases_pool_balance() {
    let env = Env::default();
    let (flash_loan_id, client, _, token_client, admin) = setup(&env);

    client.deposit(&admin, &100_000_i128);
    assert_eq!(token_client.balance(&flash_loan_id), 100_000);

    client.deposit(&admin, &50_000_i128);
    assert_eq!(token_client.balance(&flash_loan_id), 150_000);
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_deposit_zero_panics() {
    let env = Env::default();
    let (_, client, _, _, admin) = setup(&env);
    client.deposit(&admin, &0_i128);
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_deposit_negative_panics() {
    let env = Env::default();
    let (_, client, _, _, admin) = setup(&env);
    client.deposit(&admin, &(-1_i128));
}

// ---------------------------------------------------------------------------
// Liquidity – withdraw
// ---------------------------------------------------------------------------

#[test]
fn test_withdraw_decreases_pool_balance() {
    let env = Env::default();
    let (flash_loan_id, client, _, token_client, admin) = setup(&env);
    client.deposit(&admin, &500_000_i128);

    client.withdraw(&100_000_i128);
    assert_eq!(token_client.balance(&flash_loan_id), 400_000);
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_withdraw_zero_panics() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.withdraw(&0_i128);
}

#[test]
#[should_panic(expected = "amount must be > 0")]
fn test_withdraw_negative_panics() {
    let env = Env::default();
    let (_, client, _, _, _) = setup(&env);
    client.withdraw(&(-1_i128));
}

// ---------------------------------------------------------------------------
// View helpers
// ---------------------------------------------------------------------------

#[test]
fn test_get_pool_info_reflects_fee_change() {
    let env = Env::default();
    let (_, client, token_addr, _, _) = setup(&env);

    assert_eq!(client.get_pool_info().fee_bps, 9);
    client.set_fee(&25_i128);
    let info = client.get_pool_info();
    assert_eq!(info.fee_bps, 25);
    assert_eq!(info.token, token_addr);
}

#[test]
fn test_get_pool_info_admin_is_set() {
    let env = Env::default();
    let (_, client, _, _, admin) = setup(&env);
    assert_eq!(client.get_pool_info().admin, admin);
}
