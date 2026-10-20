use super::*;
use crate::{Config, SwapError};
use soroban_sdk::{
    testutils::{AuthorizedFunction, MockAuth, MockAuthInvoke},
    IntoVal,
};

#[test]
fn test_initialize_stores_config() {
    let s = Setup::new();
    assert_eq!(
        s.swap.get_config(),
        Config {
            admin: s.admin.clone(),
            oracle: s.oracle_id.clone(),
            router: s.router_id.clone(),
            max_price_age_secs: MAX_PRICE_AGE,
            target_tolerance_bps: TOLERANCE_BPS,
        }
    );
}

#[test]
fn test_initialize_requires_admin_auth() {
    let s = Setup::uninitialized();
    s.swap.initialize(
        &s.admin,
        &s.oracle_id,
        &s.router_id,
        &MAX_PRICE_AGE,
        &TOLERANCE_BPS,
    );
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.admin);
    match &auths[0].1.function {
        AuthorizedFunction::Contract((contract, name, _)) => {
            assert_eq!(contract, &s.swap_id);
            assert_eq!(name, &Symbol::new(&s.env, "initialize"));
        }
        _ => panic!("unexpected authorized function"),
    }
}

#[test]
fn test_initialize_twice_fails() {
    let s = Setup::new();
    let result = s.swap.try_initialize(
        &s.admin,
        &s.oracle_id,
        &s.router_id,
        &MAX_PRICE_AGE,
        &TOLERANCE_BPS,
    );
    assert_eq!(result, Err(Ok(SwapError::AlreadyInitialized.into())));
}

#[test]
fn test_calls_before_initialize_fail() {
    let s = Setup::uninitialized();
    assert_eq!(
        s.swap.try_get_config(),
        Err(Ok(SwapError::NotInitialized.into()))
    );
    let result = s.swap.try_create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PriceAbove(1),
        &AMOUNT,
        &0,
        &0,
        &(NOW + 1),
    );
    assert_eq!(result, Err(Ok(SwapError::NotInitialized.into())));
}

#[test]
fn test_set_config_updates_values() {
    let s = Setup::new();
    let new_oracle = Address::generate(&s.env);
    let new_router = Address::generate(&s.env);
    s.swap.set_config(&new_oracle, &new_router, &60, &10);
    let config = s.swap.get_config();
    assert_eq!(config.admin, s.admin);
    assert_eq!(config.oracle, new_oracle);
    assert_eq!(config.router, new_router);
    assert_eq!(config.max_price_age_secs, 60);
    assert_eq!(config.target_tolerance_bps, 10);
}

#[test]
fn test_set_config_rejects_non_admin() {
    let s = Setup::new();
    let attacker = Address::generate(&s.env);
    let new_oracle = Address::generate(&s.env);
    s.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &s.swap_id,
            fn_name: "set_config",
            args: (new_oracle.clone(), s.router_id.clone(), 60u64, 10u32).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let result = s.swap.try_set_config(&new_oracle, &s.router_id, &60, &10);
    assert!(result.is_err());
    assert_eq!(s.swap.get_config().oracle, s.oracle_id);
}
