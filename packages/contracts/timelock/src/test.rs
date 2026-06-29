use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Address, Env, String,
};

fn setup() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, TimelockContract);
    (env, contract_id)
}

#[test]
fn test_queue_transaction() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);
    let queued = client.get_queued_transaction(&tx_hash);

    assert!(queued.is_some());
    assert_eq!(queued.unwrap().eta, 2000);
}

#[test]
#[should_panic(expected = "ETA must be in the future")]
fn test_queue_transaction_past_eta_panics() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 3000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    client.queue_transaction(&target, &action, &eta);
}

#[test]
fn test_execute_transaction_after_eta() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);

    env.ledger().with_mut(|l| l.timestamp = 2500);

    client.execute_transaction(&tx_hash);

    assert!(client.is_executed(&tx_hash));
    assert!(client.get_queued_transaction(&tx_hash).is_none());
}

#[test]
#[should_panic(expected = "Cannot execute before ETA")]
fn test_execute_before_eta_panics() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);

    env.ledger().with_mut(|l| l.timestamp = 1500);

    client.execute_transaction(&tx_hash);
}

#[test]
fn test_revoke_transaction_before_eta() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);

    env.ledger().with_mut(|l| l.timestamp = 1500);

    client.revoke_transaction(&tx_hash);

    let queued = client.get_queued_transaction(&tx_hash);
    assert!(queued.is_none());
}

#[test]
#[should_panic(expected = "Cannot revoke after ETA has passed")]
fn test_revoke_after_eta_panics() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);

    env.ledger().with_mut(|l| l.timestamp = 2500);

    client.revoke_transaction(&tx_hash);
}

#[test]
fn test_execute_removes_from_queue_and_marks_executed() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target = Address::generate(&env);
    let action = String::from_str(&env, "transfer");
    let eta = 2000u64;

    let tx_hash = client.queue_transaction(&target, &action, &eta);

    env.ledger().with_mut(|l| l.timestamp = 2500);
    client.execute_transaction(&tx_hash);

    assert!(client.is_executed(&tx_hash));
    assert!(client.get_queued_transaction(&tx_hash).is_none());
}

#[test]
fn test_queue_multiple_transactions() {
    let (env, contract_id) = setup();
    let client = TimelockContractClient::new(&env, &contract_id);

    env.ledger().with_mut(|l| l.timestamp = 1000);

    let target1 = Address::generate(&env);
    let target2 = Address::generate(&env);
    let action = String::from_str(&env, "transfer");

    let hash1 = client.queue_transaction(&target1, &action, &2000u64);
    let hash2 = client.queue_transaction(&target2, &action, &3000u64);

    assert!(client.get_queued_transaction(&hash1).is_some());
    assert!(client.get_queued_transaction(&hash2).is_some());
}
