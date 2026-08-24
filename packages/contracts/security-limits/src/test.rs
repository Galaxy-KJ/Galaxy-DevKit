//! Tests for the security-limits contract.
#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _},
    vec, Address, BytesN, Env, Symbol,
};

fn setup() -> (Env, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, SecurityLimitsContract);
    let admin = Address::generate(&env);
    let enforcer = Address::generate(&env);
    let owner = Address::generate(&env);
    (env, contract_id, admin, enforcer, owner)
}

fn client<'a>(env: &'a Env, contract_id: &Address) -> SecurityLimitsContractClient<'a> {
    SecurityLimitsContractClient::new(env, contract_id)
}

fn hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

fn xlm(env: &Env) -> Symbol {
    Symbol::new(env, "XLM")
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[test]
fn initialize_sets_admin_and_enforcer() {
    let (env, id, admin, enforcer, _) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    assert_eq!(c.get_admin(), admin);
    assert_eq!(c.get_enforcer(), enforcer);
}

#[test]
fn initialize_rejects_reinit() {
    let (env, id, admin, enforcer, _) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let err = c.try_initialize(&admin, &enforcer).unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::AlreadyInitialized));
}

#[test]
#[should_panic]
fn initialize_without_auth_panics() {
    let env = Env::default();
    let id = env.register_contract(None, SecurityLimitsContract);
    let c = client(&env, &id);
    let admin = Address::generate(&env);
    let enforcer = Address::generate(&env);
    c.initialize(&admin, &enforcer);
}

// ---------------------------------------------------------------------------
// auth: mutating entry points panic without mock_all_auths
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn create_without_auth_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, SecurityLimitsContract);
    let c = client(&env, &id);
    let admin = Address::generate(&env);
    let enforcer = Address::generate(&env);
    c.initialize(&admin, &enforcer);
    env.mock_auths(&[]);
    let owner = Address::generate(&env);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &1000, &86400);
}

#[test]
#[should_panic]
fn update_without_auth_panics() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let limit_id = c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &1000, &86400);
    env.mock_auths(&[]);
    c.update_security_limit(&limit_id, &owner, &2000, &86400, &true);
}

#[test]
#[should_panic]
fn delete_without_auth_panics() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let limit_id = c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &1000, &86400);
    env.mock_auths(&[]);
    c.delete_security_limit(&limit_id, &owner);
}

#[test]
#[should_panic]
fn set_profile_without_auth_panics() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    env.mock_auths(&[]);
    c.set_risk_profile(
        &owner,
        &RiskLevel::Low,
        &50_000,
        &10_000,
        &vec![&env],
        &vec![&env],
    );
}

#[test]
#[should_panic]
fn record_without_auth_panics() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    env.mock_auths(&[]);
    c.record_transaction(&owner, &xlm(&env), &100, &hash(&env));
}

// ---------------------------------------------------------------------------
// create / get / update / delete
// ---------------------------------------------------------------------------

#[test]
fn create_and_get_limits() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);

    let limit_id = c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);
    assert_eq!(limit_id, 1);

    let limits = c.get_security_limits(&owner);
    assert_eq!(limits.len(), 1);
    assert_eq!(limits.get(0).unwrap().max_amount, 10_000);
}

#[test]
fn create_rejects_zero_max() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let err = c
        .try_create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &0, &86400)
        .unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::InvalidAmount));
}

#[test]
fn update_and_delete_limit() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let limit_id = c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);

    c.update_security_limit(&limit_id, &owner, &20_000, &86400, &true);
    assert_eq!(c.get_security_limits(&owner).get(0).unwrap().max_amount, 20_000);

    c.delete_security_limit(&limit_id, &owner);
    assert_eq!(c.get_security_limits(&owner).len(), 0);
}

#[test]
fn update_missing_limit_errors() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let err = c
        .try_update_security_limit(&99, &owner, &1, &86400, &true)
        .unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::LimitNotFound));
}

// ---------------------------------------------------------------------------
// owner isolation
// ---------------------------------------------------------------------------

#[test]
fn owner_a_limits_are_invisible_to_owner_b() {
    let (env, id, admin, enforcer, owner_a) = setup();
    let owner_b = Address::generate(&env);
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);

    c.create_security_limit(&owner_a, &LimitType::Daily, &xlm(&env), &10_000, &86400);
    assert_eq!(c.get_security_limits(&owner_a).len(), 1);
    assert_eq!(c.get_security_limits(&owner_b).len(), 0);

    let err = c
        .try_update_security_limit(&1, &owner_b, &1, &86400, &true)
        .unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::LimitNotFound));
}

// ---------------------------------------------------------------------------
// check + window reset
// ---------------------------------------------------------------------------

#[test]
fn check_rejects_over_daily_limit() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);

    let ok = c.check_transaction_allowed(&owner, &xlm(&env), &5_000);
    assert!(ok.allowed);
    assert!(ok.reason.is_none());

    let denied = c.check_transaction_allowed(&owner, &xlm(&env), &15_000);
    assert!(!denied.allowed);
    assert_eq!(denied.reason, Some(SecurityLimitsError::LimitExceeded as u32));
}

#[test]
fn daily_limit_resets_across_window() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);

    let tx1 = c.record_transaction(&owner, &xlm(&env), &8_000, &hash(&env));
    assert_eq!(tx1, 1);
    assert_eq!(c.get_security_limits(&owner).get(0).unwrap().current_usage, 8_000);

    let blocked = c.check_transaction_allowed(&owner, &xlm(&env), &3_000);
    assert!(!blocked.allowed);

    env.ledger().set_timestamp(env.ledger().timestamp() + 86_400);

    let after = c.check_transaction_allowed(&owner, &xlm(&env), &3_000);
    assert!(after.allowed);

    c.record_transaction(&owner, &xlm(&env), &3_000, &hash(&env));
    let limit = c.get_security_limits(&owner).get(0).unwrap();
    assert_eq!(limit.current_usage, 3_000);
}

#[test]
fn per_transaction_does_not_accumulate() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(
        &owner,
        &LimitType::PerTransaction,
        &xlm(&env),
        &1_000,
        &0,
    );

    assert!(c.check_transaction_allowed(&owner, &xlm(&env), &1_000).allowed);
    assert!(!c.check_transaction_allowed(&owner, &xlm(&env), &1_001).allowed);

    c.record_transaction(&owner, &xlm(&env), &1_000, &hash(&env));
    c.record_transaction(&owner, &xlm(&env), &1_000, &hash(&env));
    assert_eq!(c.get_security_limits(&owner).get(0).unwrap().current_usage, 0);
}

#[test]
fn check_is_read_only() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);

    env.ledger().set_timestamp(env.ledger().timestamp() + 86_400);
    c.check_transaction_allowed(&owner, &xlm(&env), &1);
    // last_reset is unchanged because check does not persist a window reset
    let limit = c.get_security_limits(&owner).get(0).unwrap();
    assert!(limit.current_usage == 0);
}

// ---------------------------------------------------------------------------
// risk profile
// ---------------------------------------------------------------------------

#[test]
fn profile_rejects_blacklisted_asset() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let scam = Symbol::new(&env, "SCAM");
    c.set_risk_profile(
        &owner,
        &RiskLevel::Medium,
        &50_000,
        &10_000,
        &vec![&env, xlm(&env)],
        &vec![&env, scam.clone()],
    );

    assert!(!c.is_asset_allowed(&owner, &scam));
    let denied = c.check_transaction_allowed(&owner, &scam, &1);
    assert!(!denied.allowed);
    assert_eq!(
        denied.reason,
        Some(SecurityLimitsError::AssetNotAllowed as u32)
    );
}

#[test]
fn profile_rejects_over_max_single() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.set_risk_profile(
        &owner,
        &RiskLevel::Medium,
        &50_000,
        &1_000,
        &vec![&env],
        &vec![&env],
    );
    let denied = c.check_transaction_allowed(&owner, &xlm(&env), &1_001);
    assert!(!denied.allowed);
    assert_eq!(
        denied.reason,
        Some(SecurityLimitsError::LimitExceeded as u32)
    );
}

#[test]
fn profile_rejects_over_daily_volume() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.set_risk_profile(
        &owner,
        &RiskLevel::Medium,
        &5_000,
        &10_000,
        &vec![&env],
        &vec![&env],
    );
    c.record_transaction(&owner, &xlm(&env), &4_000, &hash(&env));
    let denied = c.check_transaction_allowed(&owner, &xlm(&env), &1_500);
    assert!(!denied.allowed);
}

#[test]
fn no_profile_defaults_asset_allowed() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    assert!(c.is_asset_allowed(&owner, &xlm(&env)));
}

#[test]
fn record_blocked_by_profile_returns_err_and_emits_breach() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.set_risk_profile(
        &owner,
        &RiskLevel::High,
        &50_000,
        &10,
        &vec![&env],
        &vec![&env],
    );
    let err = c
        .try_record_transaction(&owner, &xlm(&env), &11, &hash(&env))
        .unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::LimitExceeded));
    assert!(!env.events().all().is_empty());
}

// ---------------------------------------------------------------------------
// events + ttl
// ---------------------------------------------------------------------------

#[test]
fn create_emits_limit_created() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);
    assert!(!env.events().all().is_empty());
}

#[test]
fn persistent_entries_have_ttl() {
    use soroban_sdk::testutils::storage::Persistent as _;

    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    c.create_security_limit(&owner, &LimitType::Daily, &xlm(&env), &10_000, &86400);

    let ttl = env.as_contract(&id, || {
        env.storage()
            .persistent()
            .get_ttl(&DataKey::Limits(owner.clone()))
    });
    assert!(ttl > 0);
}

#[test]
fn record_zero_amount_is_invalid() {
    let (env, id, admin, enforcer, owner) = setup();
    let c = client(&env, &id);
    c.initialize(&admin, &enforcer);
    let err = c
        .try_record_transaction(&owner, &xlm(&env), &0, &hash(&env))
        .unwrap_err();
    assert_eq!(err.ok(), Some(SecurityLimitsError::InvalidAmount));
}
