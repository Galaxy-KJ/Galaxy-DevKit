use super::mocks::{MockOracle, MockOracleClient, MockRouter, MockRouterClient};
use super::*;
use crate::{SwapError, SwapStatus};
use soroban_sdk::{
    testutils::{MockAuth, MockAuthInvoke},
    IntoVal,
};

struct Balances {
    owner_source: i128,
    owner_destination: i128,
    swap_source: i128,
    swap_destination: i128,
    router_source: i128,
    router_destination: i128,
}

fn balances(s: &Setup) -> Balances {
    Balances {
        owner_source: s.source.balance(&s.owner),
        owner_destination: s.destination.balance(&s.owner),
        swap_source: s.source.balance(&s.swap_id),
        swap_destination: s.destination.balance(&s.swap_id),
        router_source: s.source.balance(&s.router_id),
        router_destination: s.destination.balance(&s.router_id),
    }
}

fn assert_unchanged(s: &Setup, before: &Balances) {
    let after = balances(s);
    assert_eq!(after.owner_source, before.owner_source);
    assert_eq!(after.owner_destination, before.owner_destination);
    assert_eq!(after.swap_source, before.swap_source);
    assert_eq!(after.swap_destination, before.swap_destination);
    assert_eq!(after.router_source, before.router_source);
    assert_eq!(after.router_destination, before.router_destination);
}

#[test]
fn test_create_takes_custody_of_source_tokens() {
    let s = Setup::new();
    s.create(SwapConditionType::PriceAbove(1_100_000));

    let b = balances(&s);
    assert_eq!(b.owner_source, OWNER_FUNDS - AMOUNT);
    assert_eq!(b.swap_source, AMOUNT);
}

#[test]
fn test_create_rejects_same_token_on_both_sides() {
    let s = Setup::new();
    let result = s.swap.try_create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.source.address,
        &SwapConditionType::PriceAbove(1),
        &AMOUNT,
        &0,
        &0,
        &(NOW + 1),
    );
    assert_eq!(result, Err(Ok(SwapError::InvalidTokenPair.into())));
}

#[test]
fn test_create_rejects_invalid_amounts() {
    let s = Setup::new();
    for (amount, min_out, slippage) in [(0, 0, 0), (-1, 0, 0), (AMOUNT, -1, 0), (AMOUNT, 0, 10_001)]
    {
        let result = s.swap.try_create_swap_condition(
            &s.owner,
            &xlm(),
            &usdc(),
            &s.source.address,
            &s.destination.address,
            &SwapConditionType::PriceAbove(1),
            &amount,
            &min_out,
            &slippage,
            &(NOW + 1),
        );
        assert_eq!(result, Err(Ok(SwapError::InvalidAmount.into())));
    }
}

#[test]
fn test_execute_moves_tokens_through_the_router() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.set_market(1_200_000);

    let execution = s.swap.execute_swap_condition(&id).unwrap();

    let expected_out = AMOUNT * 1_200_000 / PRICE_SCALE;
    let b = balances(&s);
    assert_eq!(b.owner_source, OWNER_FUNDS - AMOUNT);
    assert_eq!(b.owner_destination, expected_out);
    assert_eq!(b.swap_source, 0);
    assert_eq!(b.swap_destination, 0);
    assert_eq!(b.router_source, AMOUNT);
    assert_eq!(b.router_destination, ROUTER_FUNDS - expected_out);

    assert_eq!(execution.actual_amount_out, expected_out);
    assert_eq!(execution.price_at_execution, 1_200_000);
    assert_eq!(execution.executed_at, NOW);
    assert_eq!(execution.ledger_sequence, s.env.ledger().sequence());
    assert_eq!(s.swap.get_execution_history(&id).get(0).unwrap(), execution);
}

#[test]
fn test_router_reverting_below_min_amount_out_leaves_funds_untouched() {
    let s = Setup::new();
    let id = s.create_with(SwapConditionType::PriceAbove(1_100_000), 1_000_000, 10_000);
    s.set_market(1_200_000);
    s.router.set_rate(&900_000);
    let before = balances(&s);

    assert!(s.swap.try_execute_swap_condition(&id).is_err());

    assert_unchanged(&s, &before);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Active);
}

#[test]
fn test_real_output_below_min_amount_out_panics() {
    let s = Setup::new();
    let id = s.create_with(SwapConditionType::PriceAbove(1_100_000), 1_000_000, 10_000);
    s.set_market(1_200_000);
    s.router.set_rate(&900_000);
    // The router skips its own check and reports `amount_out_min` as output.
    s.router.set_honor_min(&false);
    let before = balances(&s);

    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InsufficientOutput.into()))
    );

    assert_unchanged(&s, &before);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Active);
}

#[test]
fn test_max_slippage_floor_is_enforced_against_oracle_price() {
    let s = Setup::new();
    // 5% below the oracle-implied 1_200_000 output is 1_140_000.
    let id = s.create_with(SwapConditionType::PriceAbove(1_100_000), 0, 500);
    s.set_market(1_200_000);

    s.router.set_rate(&1_139_999);
    assert!(s.swap.try_execute_swap_condition(&id).is_err());

    s.router.set_honor_min(&false);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InsufficientOutput.into()))
    );

    s.router.set_rate(&1_140_000);
    let execution = s.swap.execute_swap_condition(&id).unwrap();
    assert_eq!(execution.actual_amount_out, 1_140_000);
    assert_eq!(s.destination.balance(&s.owner), 1_140_000);
}

#[test]
fn test_cancel_refunds_owner() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));

    s.cancel(id);

    let b = balances(&s);
    assert_eq!(b.owner_source, OWNER_FUNDS);
    assert_eq!(b.swap_source, 0);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Cancelled);
    assert_eq!(
        s.swap.try_cancel_condition(&id, &s.owner),
        Err(Ok(SwapError::ConditionNotActive.into()))
    );
}

#[test]
fn test_expired_condition_refunds_and_is_marked_expired() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));

    s.env
        .ledger()
        .with_mut(|li| li.timestamp = NOW + 86_400 + 1);
    s.set_market(1_200_000);

    assert_eq!(s.swap.execute_swap_condition(&id), None);

    let b = balances(&s);
    assert_eq!(b.owner_source, OWNER_FUNDS);
    assert_eq!(b.owner_destination, 0);
    assert_eq!(b.swap_source, 0);
    assert_eq!(b.router_source, 0);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Expired);
    assert!(s.swap.get_execution_history(&id).is_empty());
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotActive.into()))
    );
}

#[test]
fn test_cancel_with_another_owner_argument_is_unauthorized() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    let attacker = Address::generate(&s.env);

    assert_eq!(
        s.swap.try_cancel_condition(&id, &attacker),
        Err(Ok(SwapError::Unauthorized.into()))
    );
    assert_eq!(s.source.balance(&s.swap_id), AMOUNT);
}

#[test]
fn test_cancel_signed_by_another_address_fails_auth() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    let attacker = Address::generate(&s.env);
    let before = balances(&s);

    s.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &s.swap_id,
            fn_name: "cancel_condition",
            args: (id, s.owner.clone()).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.swap.try_cancel_condition(&id, &s.owner).is_err());

    assert_unchanged(&s, &before);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Active);
}

#[test]
fn test_set_config_does_not_redirect_funded_conditions() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.set_market(1_200_000);

    // The admin swaps in a new oracle and router after the deposit.
    let new_oracle_id = s.env.register_contract(None, MockOracle);
    let new_oracle = MockOracleClient::new(&s.env, &new_oracle_id);
    new_oracle.set_price(&xlm(), &usdc(), &2_000_000, &NOW);
    let new_router_id = s.env.register_contract(None, MockRouter);
    let new_router = MockRouterClient::new(&s.env, &new_router_id);
    new_router.set_rate(&2_000_000);
    s.env.mock_all_auths();
    StellarAssetClient::new(&s.env, &s.destination.address).mint(&new_router_id, &ROUTER_FUNDS);
    s.swap.set_config(
        &new_oracle_id,
        &new_router_id,
        &MAX_PRICE_AGE,
        &TOLERANCE_BPS,
    );
    s.enforce_auths();

    let condition = s.swap.get_condition(&id);
    assert_eq!(condition.oracle, s.oracle_id);
    assert_eq!(condition.router, s.router_id);

    let execution = s.swap.execute_swap_condition(&id).unwrap();
    assert_eq!(execution.price_at_execution, 1_200_000);
    assert_eq!(s.source.balance(&s.router_id), AMOUNT);
    assert_eq!(s.source.balance(&new_router_id), 0);
    assert_eq!(s.destination.balance(&new_router_id), ROUTER_FUNDS);

    // New conditions use the new config.
    s.env.mock_all_auths();
    let next = s.create(SwapConditionType::PriceAbove(1_100_000));
    assert_eq!(s.swap.get_condition(&next).router, new_router_id);
    assert_eq!(s.swap.get_condition(&next).oracle, new_oracle_id);
}
