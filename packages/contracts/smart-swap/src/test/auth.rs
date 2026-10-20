//! Who must sign what. A keeper can trigger a condition but never redirect
//! its funds.

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{AuthorizedFunction, AuthorizedInvocation, MockAuth, MockAuthInvoke},
    IntoVal,
};

#[test]
fn test_keeper_executes_and_output_goes_to_stored_owner() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    let keeper = Address::generate(&s.env);
    s.set_market(1_200_000);

    // Only the keeper signs. The owner signs nothing.
    s.env.mock_auths(&[MockAuth {
        address: &keeper,
        invoke: &MockAuthInvoke {
            contract: &s.swap_id,
            fn_name: "execute_swap_condition",
            args: (id,).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let execution = s.swap.execute_swap_condition(&id).unwrap();

    // No account authorization was needed: the contract authorizes its own
    // custody transfer.
    assert!(s.env.auths().is_empty());

    let expected_out = AMOUNT * 1_200_000 / PRICE_SCALE;
    assert_eq!(execution.actual_amount_out, expected_out);
    assert_eq!(s.destination.balance(&s.owner), expected_out);
    assert_eq!(s.destination.balance(&keeper), 0);
    assert_eq!(s.source.balance(&keeper), 0);
    assert_eq!(s.destination.balance(&s.swap_id), 0);
    assert_eq!(s.swap.get_condition(&id).owner, s.owner);
}

#[test]
fn test_create_requires_owner_auth_for_condition_and_deposit() {
    let s = Setup::new();
    s.env.mock_all_auths();
    let id = s.swap.create_swap_condition(
        &s.owner,
        &xlm(),
        &usdc(),
        &s.source.address,
        &s.destination.address,
        &SwapConditionType::PriceAbove(1_100_000),
        &AMOUNT,
        &0,
        &0,
        &(NOW + 86_400),
    );
    assert_eq!(id, 1);
    assert_eq!(
        s.env.auths(),
        std::vec![(
            s.owner.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.swap_id.clone(),
                    Symbol::new(&s.env, "create_swap_condition"),
                    (
                        s.owner.clone(),
                        xlm(),
                        usdc(),
                        s.source.address.clone(),
                        s.destination.address.clone(),
                        SwapConditionType::PriceAbove(1_100_000),
                        AMOUNT,
                        0i128,
                        0u32,
                        NOW + 86_400,
                    )
                        .into_val(&s.env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.source.address.clone(),
                        Symbol::new(&s.env, "transfer"),
                        (s.owner.clone(), s.swap_id.clone(), AMOUNT).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
}

#[test]
fn test_create_without_owner_signature_fails() {
    let s = Setup::new();
    let attacker = Address::generate(&s.env);
    let args = (
        s.owner.clone(),
        xlm(),
        usdc(),
        s.source.address.clone(),
        s.destination.address.clone(),
        SwapConditionType::PriceAbove(1),
        AMOUNT,
        0i128,
        0u32,
        NOW + 1,
    );
    s.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &s.swap_id,
            fn_name: "create_swap_condition",
            args: args.into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
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
    assert_eq!(result, Err(Ok(auth_error())));
    assert_eq!(s.source.balance(&s.owner), OWNER_FUNDS);
}

#[test]
fn test_router_cannot_pull_more_than_the_condition_amount() {
    let s = Setup::new();
    let id = s.create(SwapConditionType::PriceAbove(1_100_000));
    // A second condition keeps more source tokens in custody.
    s.create(SwapConditionType::PriceAbove(5_000_000));
    s.set_market(1_200_000);
    s.router.set_skim(&1);

    assert_eq!(
        s.swap.try_execute_swap_condition(&id),
        Err(Ok(auth_error()))
    );

    assert_eq!(s.source.balance(&s.swap_id), 2 * AMOUNT);
    assert_eq!(s.source.balance(&s.router_id), 0);
    assert_eq!(s.destination.balance(&s.owner), 0);
}

#[test]
fn test_set_config_requires_admin_signature() {
    let s = Setup::new();
    s.enforce_auths();
    let result = s.swap.try_set_config(&s.oracle_id, &s.router_id, &1, &1);
    assert_eq!(result, Err(Ok(auth_error())));
    assert_eq!(s.swap.get_config().max_price_age_secs, MAX_PRICE_AGE);

    // Same call, signed by the admin: accepted.
    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.swap_id,
            fn_name: "set_config",
            args: (s.oracle_id.clone(), s.router_id.clone(), 1u64, 1u32).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    s.swap.set_config(&s.oracle_id, &s.router_id, &1, &1);
    assert_eq!(s.swap.get_config().max_price_age_secs, 1);
}
