use super::*;
use crate::{SwapError, SwapStatus};

#[test]
fn test_price_above_follows_the_oracle() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));

    s.set_market(1_000_000);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    s.set_market(1_200_000);
    let execution = s.swap.execute_swap_condition(&id).unwrap();
    assert_eq!(execution.price_at_execution, 1_200_000);
    assert_eq!(s.swap.get_condition(&id).status, SwapStatus::Executed);
}

#[test]
fn test_price_below_follows_the_oracle() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceBelow(900_000));

    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    s.set_market(899_999);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_stale_price_is_rejected() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));

    s.router.set_rate(&1_200_000);
    s.set_oracle_price(1_200_000, NOW - MAX_PRICE_AGE - 1);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::PriceStale.into()))
    );

    s.set_oracle_price(1_200_000, NOW - MAX_PRICE_AGE);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_stale_price_is_rejected_at_creation() {
    let s = Setup::new();
    s.set_oracle_price(1_000_000, NOW - MAX_PRICE_AGE - 1);
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
    assert_eq!(result, Err(Ok(SwapError::PriceStale.into())));
}

#[test]
fn test_non_positive_price_is_rejected() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceBelow(900_000));

    s.set_market(0);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InvalidPrice.into()))
    );
    s.set_market(-5);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::InvalidPrice.into()))
    );
}

#[test]
fn test_target_price_uses_tolerance_band() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::TargetPrice(1_000_000));

    // 50 bps of 1_000_000 is 5_000.
    s.set_market(1_010_000);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );
    s.set_market(995_000 - 1);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    s.set_market(1_004_000);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_target_price_band_edges_are_inclusive() {
    let s = Setup::new();
    let low = s.create(SwapConditionType::TargetPrice(1_000_000));
    let high = s.create(SwapConditionType::TargetPrice(1_000_000));

    s.set_market(995_000);
    assert!(s.swap.execute_swap_condition(&low).is_some());
    s.set_market(1_005_000);
    assert!(s.swap.execute_swap_condition(&high).is_some());
}

#[test]
fn test_reference_price_is_fixed_at_creation() {
    let s = Setup::new();
    s.set_market(1_234_567);
    let id = s.create(SwapConditionType::PercentageIncrease(10));
    assert_eq!(s.swap.get_condition(&id).reference_price, 1_234_567);
}

#[test]
fn test_percentage_decrease_against_creation_price() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PercentageDecrease(10));

    s.set_market(950_000);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    s.set_market(899_000);
    let execution = s.swap.execute_swap_condition(&id).unwrap();
    assert_eq!(execution.price_at_execution, 899_000);
}

#[test]
fn test_percentage_increase_against_creation_price() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PercentageIncrease(10));

    s.set_market(1_099_999);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    s.set_market(1_100_000);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}

#[test]
fn test_percentage_decrease_over_100_is_rejected() {
    let s = Setup::new();
    let result = s.swap.try_create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PercentageDecrease(101),
        &AMOUNT,
        &0,
        &0,
        &(NOW + 1),
    );
    assert_eq!(result, Err(Ok(SwapError::InvalidAmount.into())));
}

#[test]
fn test_execute_unknown_condition_fails() {
    let s = Setup::new();
    assert_eq!(
        s.swap.try_execute_swap_condition(&42),
        Err(Ok(SwapError::ConditionNotFound.into()))
    );
}

#[test]
fn test_executed_condition_cannot_run_twice() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1));
    s.swap.execute_swap_condition(&id);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotActive.into()))
    );
}

#[test]
fn test_set_config_does_not_change_open_condition_price_parameters() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::TargetPrice(1_000_000));
    let condition = s.swap.get_condition(&id);
    assert_eq!(condition.max_price_age_secs, MAX_PRICE_AGE);
    assert_eq!(condition.target_tolerance_bps, TOLERANCE_BPS);

    // Widest band and tightest age the config allows.
    s.env.mock_all_auths();
    s.swap.set_config(&s.oracle_id, &s.router_id, &1, &10_000);
    s.enforce_auths();

    // 50% off target: inside a 10_000 bps band, outside the pinned 50 bps.
    s.set_market(1_500_000);
    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(SwapError::ConditionNotMet.into()))
    );

    // 100s old: stale under the new 1s limit, fresh under the pinned 300s.
    s.router.set_rate(&1_004_000);
    s.set_oracle_price(1_004_000, NOW - 100);
    assert!(s.swap.execute_swap_condition(&id).is_some());
}
