//! Input bounds: expiry, config, oracle timestamps and overflow.

use super::*;
use crate::{SwapError, MAX_CONDITION_DURATION_SECS};
use soroban_sdk::testutils::Ledger as _;

type TryResult<T> =
    Result<Result<T, soroban_sdk::Error>, Result<soroban_sdk::Error, soroban_sdk::InvokeError>>;

fn try_create_expiring(s: &Setup, expires_at: u64) -> TryResult<u64> {
    s.env.mock_all_auths();
    s.swap.try_create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PriceAbove(1),
        &AMOUNT,
        &0,
        &0,
        &expires_at,
    )
}

#[test]
fn test_expiry_must_be_in_the_future() {
    let s = Setup::new();
    assert_eq!(
        try_create_expiring(&s, NOW),
        Err(Ok(SwapError::InvalidExpiry.into()))
    );
    assert_eq!(
        try_create_expiring(&s, NOW - 1),
        Err(Ok(SwapError::InvalidExpiry.into()))
    );
    assert_eq!(s.source.balance(&s.owner), OWNER_FUNDS);
    assert_eq!(try_create_expiring(&s, NOW + 1), Ok(Ok(1)));
}

#[test]
fn test_expiry_is_bounded_by_max_duration() {
    let s = Setup::new();
    assert_eq!(MAX_CONDITION_DURATION_SECS, 365 * 24 * 60 * 60);
    assert_eq!(
        try_create_expiring(&s, NOW + MAX_CONDITION_DURATION_SECS + 1),
        Err(Ok(SwapError::InvalidExpiry.into()))
    );
    assert_eq!(
        try_create_expiring(&s, NOW + MAX_CONDITION_DURATION_SECS),
        Ok(Ok(1))
    );
}

#[test]
fn test_execution_at_exactly_expires_at_still_executes() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1));
    let expires_at = s.swap.get_condition(&id).expires_at;

    s.env.ledger().with_mut(|li| li.timestamp = expires_at);
    s.set_market(PRICE_SCALE);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_initialize_rejects_out_of_range_config() {
    for (age, tolerance) in [(0u64, TOLERANCE_BPS), (MAX_PRICE_AGE, 10_001u32)] {
        let s = Setup::uninitialized();
        assert_eq!(
            s.swap
                .try_initialize(&s.admin, &s.oracle_id, &s.router_id, &age, &tolerance),
            Err(Ok(SwapError::InvalidConfig.into()))
        );
    }
    let s = Setup::uninitialized();
    s.swap
        .initialize(&s.admin, &s.oracle_id, &s.router_id, &1, &10_000);
}

#[test]
fn test_set_config_rejects_out_of_range_config() {
    let s = Setup::new();
    assert_eq!(
        s.swap
            .try_set_config(&s.oracle_id, &s.router_id, &0, &TOLERANCE_BPS),
        Err(Ok(SwapError::InvalidConfig.into()))
    );
    assert_eq!(
        s.swap
            .try_set_config(&s.oracle_id, &s.router_id, &MAX_PRICE_AGE, &10_001),
        Err(Ok(SwapError::InvalidConfig.into()))
    );
    s.swap.set_config(&s.oracle_id, &s.router_id, &1, &10_000);
}

#[test]
fn test_future_dated_oracle_price_is_rejected() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.router.set_rate(&1_200_000);

    // Both oracles report a future timestamp as age 0, i.e. fresh.
    s.set_oracle_price(1_200_000, NOW + 1);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::PriceStale.into()))
    );
}

#[test]
fn test_old_price_is_rejected_even_if_oracle_says_fresh() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    s.router.set_rate(&1_200_000);
    s.oracle.set_never_stale(&true);

    s.set_oracle_price(1_200_000, NOW - MAX_PRICE_AGE - 1);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::PriceStale.into()))
    );
    s.set_oracle_price(1_200_000, NOW - MAX_PRICE_AGE);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_percentage_decrease_of_100_is_rejected() {
    // A 100% decrease needs a price <= 0, which the oracle never returns.
    let s = Setup::new();
    s.env.mock_all_auths();
    let result = s.swap.try_create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PercentageDecrease(100),
        &AMOUNT,
        &0,
        &0,
        &(NOW + 1),
    );
    assert_eq!(result, Err(Ok(SwapError::InvalidAmount.into())));
    s.create(SwapConditionType::PercentageDecrease(99));
}

#[test]
fn test_percentage_math_overflow_is_invalid_price() {
    let s = Setup::new();
    s.set_market(i128::MAX / 1_000);
    let id = s.create(SwapConditionType::PercentageIncrease(u32::MAX));
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InvalidPrice.into()))
    );
}

#[test]
fn test_target_price_math_overflow_is_invalid_price() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::TargetPrice(i128::MAX / 2));
    s.set_market(i128::MAX / 2);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InvalidPrice.into()))
    );
}

#[test]
fn test_slippage_math_overflow_is_invalid_price() {
    let s = Setup::new();
    let huge: i128 = 1_000_000_000_000_000_000_000_000_000_000; // 1e30
    s.env.mock_all_auths();
    StellarAssetClient::new(&s.env, &s.source.address).mint(&s.owner, &huge);
    s.set_market(1_000_000_000); // amount * price = 1e39 > i128::MAX
    let id = s.swap.create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PriceAbove(1),
        &huge,
        &0,
        &0,
        &(NOW + 1),
    );
    s.enforce_auths();
    let before = s.source.balance(&s.swap_id);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InvalidPrice.into()))
    );
    assert_eq!(s.source.balance(&s.swap_id), before);
}
