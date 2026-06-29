use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env,
};

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, VestingContract);
    (env, contract_id)
}

#[test]
fn test_create_schedule() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    let schedule = client.get_schedule(&beneficiary);
    assert!(schedule.is_some());
    assert_eq!(schedule.unwrap().total_amount, total_amount);
}

#[test]
#[should_panic(expected = "Total amount must be positive")]
fn test_create_schedule_zero_amount_panics() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    let beneficiary = Address::generate(&env);
    client.create_schedule(&beneficiary, &0i128, &1000u64, &1000u64, &4000u64);
}

#[test]
fn test_cliff_period_blocks_claim() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 1500);

    let vested = client.get_vested_amount(&beneficiary);
    assert_eq!(vested, 0);
}

#[test]
fn test_full_vesting_after_duration() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 6000);

    let vested = client.get_vested_amount(&beneficiary);
    assert_eq!(vested, total_amount);
}

#[test]
fn test_partial_claim() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 3500);

    let vested = client.get_vested_amount(&beneficiary);
    let expected = (total_amount * 2500i128) / 4000i128;
    assert_eq!(vested, expected);
}

#[test]
fn test_claim_tokens() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 3500);

    let claimable = client.claim_tokens(&beneficiary);
    let expected = (total_amount * 2500i128) / 4000i128;
    assert_eq!(claimable, expected);

    let claimed = client.get_claimed_amount(&beneficiary);
    assert_eq!(claimed, expected);
}

#[test]
fn test_multiple_claims_accumulate() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 2500);

    let first_claim = client.claim_tokens(&beneficiary);
    let expected_first = (total_amount * 1500i128) / 4000i128;
    assert_eq!(first_claim, expected_first);

    env.ledger().with_mut(|l| l.timestamp = 4500);

    let second_claim = client.claim_tokens(&beneficiary);
    let total_vested = (total_amount * 3500i128) / 4000i128;
    let expected_second = total_vested - expected_first;
    assert_eq!(second_claim, expected_second);
}

#[test]
fn test_full_claim_at_maturity() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 6000);

    let claim = client.claim_tokens(&beneficiary);
    assert_eq!(claim, total_amount);
}

#[test]
#[should_panic(expected = "Cliff period not yet passed")]
fn test_claim_during_cliff_panics() {
    let (env, contract_id) = setup();
    let client = VestingContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 500);

    let beneficiary = Address::generate(&env);
    let total_amount: i128 = 100_000_000;
    let start = 1000u64;
    let cliff = 1000u64;
    let duration = 4000u64;

    client.create_schedule(&beneficiary, &total_amount, &start, &cliff, &duration);

    env.ledger().with_mut(|l| l.timestamp = 1800);

    client.claim_tokens(&beneficiary);
}
