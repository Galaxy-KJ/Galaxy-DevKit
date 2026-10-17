use soroban_sdk::{
    testutils::{storage::Instance as _, Address as _, Ledger, StellarAsset as _},
    token, Address, Env, String,
};

use crate::{GovernanceContract, GovernanceContractClient, ProposalStatus, DEFAULT_VOTING_PERIOD_SECS, INSTANCE_TTL_EXTEND, INSTANCE_TTL_THRESHOLD};

const VOTING_PERIOD_SECS: u64 = DEFAULT_VOTING_PERIOD_SECS;

fn setup() -> (Env, GovernanceContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    // Initialize the contract
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    client.initialize(&admin, &token, &VOTING_PERIOD_SECS, &1_000);

    (env, client)
}

fn setup_with_token() -> (Env, GovernanceContractClient<'static>, token::Client<'static>) {
    let env = Env::default();
    env.mock_all_auths();

    // Register a mock token contract
    let admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(admin.clone());
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, GovernanceContract);
    let client = GovernanceContractClient::new(&env, &contract_id);

    // Initialize the contract with the token
    client.initialize(&admin, &token_id, &VOTING_PERIOD_SECS, &1_000);

    (env, client, token_client)
}

// ── Happy path ────────────────────────────────────────────────────────────

#[test]
fn test_lock_and_propose() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);

    // Mint tokens to proposer
    token_client.mint(&proposer, &500);

    // Approve contract to spend tokens
    token_client.approve(&proposer, &client.address, &500, &100);

    client.lock_tokens(&proposer, &500);

    let lock = client.get_lock(&proposer).unwrap();
    assert_eq!(lock.amount, 500);

    let action = String::from_str(&env, "transfer_treasury_100_USDC");
    let id = client.propose(&proposer, &action);
    assert_eq!(id, 0);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.status, ProposalStatus::Active);
    assert_eq!(proposal.votes_for, 0);
    assert_eq!(proposal.votes_against, 0);
}

#[test]
fn test_vote_for_and_against() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter_a = Address::generate(&env);
    let voter_b = Address::generate(&env);

    // Mint tokens
    token_client.mint(&proposer, &100);
    token_client.mint(&voter_a, &800);
    token_client.mint(&voter_b, &400);

    // Approve contract to spend tokens
    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter_a, &client.address, &800, &100);
    token_client.approve(&voter_b, &client.address, &400, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter_a, &800);
    client.lock_tokens(&voter_b, &400);

    let action = String::from_str(&env, "upgrade_protocol_v2");
    let id = client.propose(&proposer, &action);

    client.vote(&voter_a, &id, &800, &true);
    client.vote(&voter_b, &id, &400, &false);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.votes_for, 800);
    assert_eq!(proposal.votes_against, 400);
}

#[test]
fn test_full_lifecycle_passes() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let executor = Address::generate(&env);

    // Mint tokens
    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &2_000);

    // Approve contract to spend tokens
    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &2_000, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &2_000);

    let id = client.propose(&proposer, &String::from_str(&env, "mint_rewards"));

    client.vote(&voter, &id, &2_000, &true);

    // Advance ledger past voting period.
    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.finalize(&id);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.status, ProposalStatus::Passed);

    client.execute(&executor, &id);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.status, ProposalStatus::Executed);
}

#[test]
fn test_full_lifecycle_rejected_low_approval() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter_for = Address::generate(&env);
    let voter_against = Address::generate(&env);

    // Mint tokens
    token_client.mint(&proposer, &100);
    token_client.mint(&voter_for, &400);
    token_client.mint(&voter_against, &700);

    // Approve contract to spend tokens
    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter_for, &client.address, &400, &100);
    token_client.approve(&voter_against, &client.address, &700, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter_for, &400);
    client.lock_tokens(&voter_against, &700);

    let id = client.propose(&proposer, &String::from_str(&env, "change_fee_params"));

    client.vote(&voter_for, &id, &400, &true);
    client.vote(&voter_against, &id, &700, &false);

    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.finalize(&id);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.status, ProposalStatus::Rejected);
}

#[test]
fn test_full_lifecycle_rejected_below_quorum() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    // Mint tokens
    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &100);

    // Approve contract to spend tokens
    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &100, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &100);

    let id = client.propose(&proposer, &String::from_str(&env, "minor_param_update"));

    // voter_for = 100 — below QUORUM_THRESHOLD of 1_000
    client.vote(&voter, &id, &100, &true);

    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.finalize(&id);

    let proposal = client.get_proposal(&id).unwrap();
    assert_eq!(proposal.status, ProposalStatus::Rejected);
}

// ── Edge / error cases ────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "proposer must lock tokens before creating a proposal")]
fn test_propose_without_lock_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    client.propose(&proposer, &String::from_str(&env, "no_lock_action"));
}

#[test]
#[should_panic(expected = "voter has no locked tokens")]
fn test_vote_without_lock_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.approve(&proposer, &client.address, &500, &100);
    client.lock_tokens(&proposer, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &100, &true);
}

#[test]
#[should_panic(expected = "voting weight exceeds locked token balance")]
fn test_vote_exceeds_lock_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &200);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &200, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &200);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &500, &true); // 500 > 200 locked
}

#[test]
#[should_panic(expected = "voting period has ended")]
fn test_vote_after_period_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.mint(&voter, &500);

    token_client.approve(&proposer, &client.address, &500, &100);
    token_client.approve(&voter, &client.address, &500, &100);

    client.lock_tokens(&proposer, &500);
    client.lock_tokens(&voter, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));

    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.vote(&voter, &id, &500, &true);
}

#[test]
#[should_panic(expected = "voting period has not yet ended")]
fn test_finalize_before_period_ends_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.approve(&proposer, &client.address, &500, &100);
    client.lock_tokens(&proposer, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.finalize(&id);
}

#[test]
#[should_panic(expected = "proposal must be in Passed status to execute")]
fn test_execute_rejected_proposal_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let executor = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &100);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &100, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &100);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &100, &true); // quorum not met

    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.finalize(&id);
    client.execute(&executor, &id); // status = Rejected → panic
}

#[test]
#[should_panic(expected = "proposal must be in Passed status to execute")]
fn test_execute_active_proposal_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let executor = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.approve(&proposer, &client.address, &500, &100);
    client.lock_tokens(&proposer, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.execute(&executor, &id);
}

#[test]
fn test_accumulate_lock_tokens() {
    let (env, client, token_client) = setup_with_token();
    let voter = Address::generate(&env);

    token_client.mint(&voter, &1_000);
    token_client.approve(&voter, &client.address, &1_000, &100);

    client.lock_tokens(&voter, &300);
    client.lock_tokens(&voter, &700);

    let lock = client.get_lock(&voter).unwrap();
    assert_eq!(lock.amount, 1_000);
}

#[test]
fn test_unlock_tokens() {
    let (env, client, token_client) = setup_with_token();
    let voter = Address::generate(&env);

    token_client.mint(&voter, &500);
    token_client.approve(&voter, &client.address, &500, &100);

    client.lock_tokens(&voter, &500);
    client.unlock_tokens(&voter);

    assert!(client.get_lock(&voter).is_none());
}

#[test]
fn test_next_proposal_id_increments() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.approve(&proposer, &client.address, &500, &100);
    client.lock_tokens(&proposer, &500);

    assert_eq!(client.next_proposal_id(), 0);
    client.propose(&proposer, &String::from_str(&env, "p1"));
    assert_eq!(client.next_proposal_id(), 1);
    client.propose(&proposer, &String::from_str(&env, "p2"));
    assert_eq!(client.next_proposal_id(), 2);
}

#[test]
fn test_get_vote_record() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &600);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &600, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &600);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &600, &true);

    let record = client.get_vote(&voter, &id).unwrap();
    assert_eq!(record.weight, 600);
    assert!(record.support);
}

// ── TTL — instance storage survivability and exact boundary behavior ──────

#[test]
fn test_lock_tokens_extends_instance_ttl() {
    let (env, client, token_client) = setup_with_token();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let voter = Address::generate(&env);

    token_client.mint(&voter, &500);
    token_client.approve(&voter, &client.address, &500, &100);

    client.lock_tokens(&voter, &500);

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_instance_ttl_survives_past_initial_threshold_via_propose() {
    let (env, client, token_client) = setup_with_token();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let proposer = Address::generate(&env);

    token_client.mint(&proposer, &500);
    token_client.approve(&proposer, &client.address, &500, &100);
    client.lock_tokens(&proposer, &500);

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    client.propose(&proposer, &String::from_str(&env, "keep alive"));

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_instance_ttl_boundary_behavior() {
    let (env, client, token_client) = setup_with_token();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let voter = Address::generate(&env);

    token_client.mint(&voter, &500);
    token_client.approve(&voter, &client.address, &500, &100);
    client.lock_tokens(&voter, &500);

    let just_before_threshold = 100 + (INSTANCE_TTL_EXTEND - INSTANCE_TTL_THRESHOLD - 1);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    client.lock_tokens(&voter, &1);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(
        ttl,
        INSTANCE_TTL_THRESHOLD + 1,
        "must not re-extend before threshold"
    );

    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    client.lock_tokens(&voter, &1);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND, "must re-extend at/past threshold");
}

#[test]
fn test_finalize_and_execute_extend_instance_ttl() {
    let (env, client, token_client) = setup_with_token();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    let executor = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &2_000);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &2_000, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &2_000);
    let id = client.propose(&proposer, &String::from_str(&env, "mint_rewards"));
    client.vote(&voter, &id, &2_000, &true);

    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
        li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1;
    });
    client.finalize(&id);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);

    env.ledger()
        .with_mut(|li| li.sequence_number += INSTANCE_TTL_EXTEND - 1);
    client.execute(&executor, &id);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_unlock_tokens_extends_instance_ttl() {
    let (env, client, token_client) = setup_with_token();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let voter = Address::generate(&env);

    token_client.mint(&voter, &500);
    token_client.approve(&voter, &client.address, &500, &100);
    client.lock_tokens(&voter, &500);

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    client.unlock_tokens(&voter);

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

// ── Security tests for token escrow ───────────────────────────────────────

#[test]
#[should_panic(expected = "lock amount must be positive")]
fn test_lock_zero_amount_panics() {
    let (env, client, token_client) = setup_with_token();
    let voter = Address::generate(&env);

    client.lock_tokens(&voter, &0);
}

#[test]
#[should_panic(expected = "cannot unlock tokens while having active votes")]
fn test_unlock_during_active_vote_panics() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &500);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &500, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &500, &true);

    // Try to unlock while vote is still active - should panic
    client.unlock_tokens(&voter);
}

#[test]
fn test_unlock_after_finalization_succeeds() {
    let (env, client, token_client) = setup_with_token();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);

    token_client.mint(&proposer, &100);
    token_client.mint(&voter, &500);

    token_client.approve(&proposer, &client.address, &100, &100);
    token_client.approve(&voter, &client.address, &500, &100);

    client.lock_tokens(&proposer, &100);
    client.lock_tokens(&voter, &500);

    let id = client.propose(&proposer, &String::from_str(&env, "action"));
    client.vote(&voter, &id, &500, &true);

    // Advance ledger past voting period
    env.ledger().with_mut(|li| {
        li.timestamp += VOTING_PERIOD_SECS + 1;
    });

    client.finalize(&id);

    // Now unlock should succeed
    client.unlock_tokens(&voter);
    assert!(client.get_lock(&voter).is_none());
}

#[test]
fn test_balances_return_after_unlock() {
    let (env, client, token_client) = setup_with_token();
    let voter = Address::generate(&env);

    let initial_balance = 1000;
    let lock_amount = 500;

    token_client.mint(&voter, &initial_balance);
    token_client.approve(&voter, &client.address, &lock_amount, &100);

    let balance_before_lock = token_client.balance(&voter);
    assert_eq!(balance_before_lock, initial_balance);

    client.lock_tokens(&voter, &lock_amount);

    let balance_after_lock = token_client.balance(&voter);
    assert_eq!(balance_after_lock, initial_balance - lock_amount);

    client.unlock_tokens(&voter);

    let balance_after_unlock = token_client.balance(&voter);
    assert_eq!(balance_after_unlock, initial_balance);
}

#[test]
#[should_panic(expected = "contract already initialized")]
fn test_initialize_twice_panics() {
    let (env, client, token_client) = setup_with_token();
    let admin = Address::generate(&env);
    let token = Address::generate(&env);

    client.initialize(&admin, &token, &VOTING_PERIOD_SECS, &1_000);
}
