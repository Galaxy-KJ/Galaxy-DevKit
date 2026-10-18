#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, Map, String, Symbol,
};

// ── Storage keys ──────────────────────────────────────────────────────────────

const PROPOSALS: Symbol = symbol_short!("PROPOSALS");
const VOTES: Symbol = symbol_short!("VOTES"); // Map<(Address, u32), VoteRecord>
const LOCKS: Symbol = symbol_short!("LOCKS");
const NEXT_ID: Symbol = symbol_short!("NEXT_ID");
const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN");
const VOTING_PERIOD: Symbol = symbol_short!("VOTING_PERIOD");
const QUORUM: Symbol = symbol_short!("QUORUM");
const ACTIVE_VOTE_COUNT: Symbol = symbol_short!("ACTIVE_VOTE_COUNT"); // Map<Address, u32>

// ── Configuration ─────────────────────────────────────────────────────────────

/// Default voting period in ledger seconds (7 days at ~5 s/ledger).
pub const DEFAULT_VOTING_PERIOD_SECS: u64 = 7 * 24 * 60 * 60;

/// Default minimum total weight (for + against) required for a proposal to pass.
/// Prevents low-participation proposals from executing.
const DEFAULT_QUORUM_THRESHOLD: i128 = 1_000;

/// Minimum FOR weight as a percentage of total votes cast (50 % = majority).
const APPROVAL_THRESHOLD_PCT: i128 = 50;

/// Proposals, votes and locks can sit idle for weeks between interactions
/// (the voting period alone is 7 days), so use a longer TTL horizon.
pub const INSTANCE_TTL_THRESHOLD: u32 = 241_920; // ~14 days
pub const INSTANCE_TTL_EXTEND: u32 = 483_840; // ~28 days

// ── Types ─────────────────────────────────────────────────────────────────────

/// On-chain status of a proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    /// Voting is still open.
    Active,
    /// Voting period ended, threshold met, not yet executed.
    Passed,
    /// Threshold not met or quorum not reached after voting period.
    Rejected,
    /// Proposal has been executed.
    Executed,
}

/// A single governance proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    /// Address that created the proposal.
    pub proposer: Address,
    /// Human-readable description / encoded action.
    pub action: String,
    /// Ledger timestamp when the proposal was created.
    pub created_at: u64,
    /// Voting is open until this timestamp.
    pub voting_ends_at: u64,
    /// Accumulated weight voting FOR.
    pub votes_for: i128,
    /// Accumulated weight voting AGAINST.
    pub votes_against: i128,
    pub status: ProposalStatus,
}

/// A voter's locked token balance used as voting weight.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenLock {
    pub voter: Address,
    pub amount: i128,
    pub locked_at: u64,
}

/// The vote cast by a single voter on a single proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteRecord {
    pub voter: Address,
    pub proposal_id: u32,
    pub weight: i128,
    pub support: bool,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct GovernanceContract;

#[contractimpl]
impl GovernanceContract {
    // ── Initialization ───────────────────────────────────────────────────────

    /// Initialize the governance contract with configuration.
    ///
    /// Can only be called once. Sets the admin address, governance token address,
    /// voting period, and quorum threshold.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        voting_period: u64,
        quorum: i128,
    ) {
        if env.storage().instance().has(&ADMIN) {
            panic!("contract already initialized");
        }

        if voting_period == 0 {
            panic!("voting period must be positive");
        }

        if quorum <= 0 {
            panic!("quorum must be positive");
        }

        env.storage().instance().set(&ADMIN, &admin);
        env.storage().instance().set(&TOKEN, &token);
        env.storage().instance().set(&VOTING_PERIOD, &voting_period);
        env.storage().instance().set(&QUORUM, &quorum);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    // ── Proposal management ───────────────────────────────────────────────────

    /// Create a new governance proposal.
    ///
    /// The proposer must have locked tokens (see `lock_tokens`).
    /// Returns the newly assigned proposal ID.
    pub fn propose(env: Env, proposer: Address, action: String) -> u32 {
        proposer.require_auth();

        // Proposer must have locked tokens to submit a proposal.
        let locks: Map<Address, TokenLock> =
            env.storage().instance().get(&LOCKS).unwrap_or(Map::new(&env));

        if !locks.contains_key(proposer.clone()) {
            panic!("proposer must lock tokens before creating a proposal");
        }

        let lock = locks.get(proposer.clone()).unwrap();
        if lock.amount == 0 {
            panic!("proposer must have a non-zero token lock");
        }

        // Assign a monotonically increasing proposal ID.
        let id: u32 = env.storage().instance().get(&NEXT_ID).unwrap_or(0u32);
        let next_id = id.checked_add(1).expect("proposal ID overflow");

        let now = env.ledger().timestamp();
        let voting_period: u64 = env.storage().instance().get(&VOTING_PERIOD).unwrap();
        let proposal = Proposal {
            id,
            proposer,
            action,
            created_at: now,
            voting_ends_at: now + voting_period,
            votes_for: 0,
            votes_against: 0,
            status: ProposalStatus::Active,
        };

        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&PROPOSALS).unwrap_or(Map::new(&env));

        proposals.set(id, proposal);
        env.storage().instance().set(&PROPOSALS, &proposals);
        env.storage().instance().set(&NEXT_ID, &next_id);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        id
    }

    /// Cast a vote on an active proposal.
    ///
    /// `weight`  — token-weighted voting power; must not exceed the voter's
    ///             current lock (prevents double-counting across proposals).
    /// `support` — `true` = vote FOR, `false` = vote AGAINST.
    pub fn vote(env: Env, voter: Address, proposal_id: u32, weight: i128, support: bool) {
        voter.require_auth();

        if weight <= 0 {
            panic!("voting weight must be positive");
        }

        // Validate token lock.
        let locks: Map<Address, TokenLock> =
            env.storage().instance().get(&LOCKS).unwrap_or(Map::new(&env));

        let lock = locks.get(voter.clone()).expect("voter has no locked tokens");

        if weight > lock.amount {
            panic!("voting weight exceeds locked token balance");
        }

        // Load proposal and assert it is still Active.
        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&PROPOSALS).unwrap_or(Map::new(&env));

        let mut proposal = proposals
            .get(proposal_id)
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Active {
            panic!("proposal is not active");
        }

        if env.ledger().timestamp() > proposal.voting_ends_at {
            panic!("voting period has ended");
        }

        // Prevent double-voting on the same proposal.
        let vote_key = (voter.clone(), proposal_id);
        let all_votes: Map<(Address, u32), VoteRecord> =
            env.storage().instance().get(&VOTES).unwrap_or(Map::new(&env));

        if all_votes.contains_key(vote_key.clone()) {
            panic!("voter has already voted on this proposal");
        }

        // Record vote.
        let record = VoteRecord {
            voter: voter.clone(),
            proposal_id,
            weight,
            support,
        };

        let mut all_votes = all_votes;
        all_votes.set(vote_key, record);
        env.storage().instance().set(&VOTES, &all_votes);

        // Track active vote count for this voter.
        let mut active_vote_count: Map<Address, u32> =
            env.storage().instance().get(&ACTIVE_VOTE_COUNT).unwrap_or(Map::new(&env));
        let current_count = active_vote_count.get(voter.clone()).unwrap_or(0);
        let new_count = current_count.checked_add(1).expect("active vote count overflow");
        active_vote_count.set(voter, new_count);
        env.storage().instance().set(&ACTIVE_VOTE_COUNT, &active_vote_count);

        // Accumulate weight.
        if support {
            proposal.votes_for = proposal
                .votes_for
                .checked_add(weight)
                .expect("votes_for overflow");
        } else {
            proposal.votes_against = proposal
                .votes_against
                .checked_add(weight)
                .expect("votes_against overflow");
        }

        proposals.set(proposal_id, proposal);
        env.storage().instance().set(&PROPOSALS, &proposals);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Finalise a proposal after its voting period has ended.
    ///
    /// Sets the status to `Passed` or `Rejected` based on quorum and
    /// approval threshold. Must be called before `execute`.
    pub fn finalize(env: Env, proposal_id: u32) {
        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&PROPOSALS).unwrap_or(Map::new(&env));

        let mut proposal = proposals
            .get(proposal_id)
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Active {
            panic!("proposal is not active");
        }

        if env.ledger().timestamp() <= proposal.voting_ends_at {
            panic!("voting period has not yet ended");
        }

        let total = proposal
            .votes_for
            .checked_add(proposal.votes_against)
            .expect("total votes overflow");

        let quorum: i128 = env.storage().instance().get(&QUORUM).unwrap();
        let passed = total >= quorum
            && proposal.votes_for * 100 > total * APPROVAL_THRESHOLD_PCT;

        proposal.status = if passed {
            ProposalStatus::Passed
        } else {
            ProposalStatus::Rejected
        };

        proposals.set(proposal_id, proposal);
        env.storage().instance().set(&PROPOSALS, &proposals);

        // Decrement active vote count for all voters on this proposal.
        let all_votes: Map<(Address, u32), VoteRecord> =
            env.storage().instance().get(&VOTES).unwrap_or(Map::new(&env));
        let mut active_vote_count: Map<Address, u32> =
            env.storage().instance().get(&ACTIVE_VOTE_COUNT).unwrap_or(Map::new(&env));

        for (voter, vote_proposal_id) in all_votes.keys() {
            if vote_proposal_id == proposal_id {
                let current_count = active_vote_count.get(voter.clone()).unwrap_or(0);
                if current_count > 0 {
                    active_vote_count.set(voter, current_count - 1);
                }
            }
        }

        env.storage().instance().set(&ACTIVE_VOTE_COUNT, &active_vote_count);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Execute a proposal that has `Passed`.
    ///
    /// Marks the proposal as `Executed`. Actual cross-contract dispatch is
    /// intentionally left to the caller — the contract records intent on-chain
    /// and the `action` string encodes what must be done (XDR-encoded call
    /// or human-readable instruction).
    pub fn execute(env: Env, executor: Address, proposal_id: u32) {
        executor.require_auth();

        let mut proposals: Map<u32, Proposal> =
            env.storage().instance().get(&PROPOSALS).unwrap_or(Map::new(&env));

        let mut proposal = proposals
            .get(proposal_id)
            .expect("proposal not found");

        if proposal.status != ProposalStatus::Passed {
            panic!("proposal must be in Passed status to execute");
        }

        proposal.status = ProposalStatus::Executed;
        proposals.set(proposal_id, proposal);
        env.storage().instance().set(&PROPOSALS, &proposals);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    // ── Token lock management ─────────────────────────────────────────────────

    /// Lock `amount` governance tokens to gain voting weight.
    ///
    /// Transfers tokens from the voter to the contract via the token contract's
    /// `transfer_from` method. The voter must have approved the governance contract
    /// to spend their tokens beforehand.
    pub fn lock_tokens(env: Env, voter: Address, amount: i128) {
        voter.require_auth();

        if amount <= 0 {
            panic!("lock amount must be positive");
        }

        let token_address: Address = env.storage().instance().get(&TOKEN).expect("contract not initialized");
        let contract_address = env.current_contract_address();

        // Transfer tokens from voter to contract (escrow)
        token::Client::new(&env, &token_address).transfer_from(
            &contract_address,
            &voter,
            &contract_address,
            &amount,
        );

        let mut locks: Map<Address, TokenLock> =
            env.storage().instance().get(&LOCKS).unwrap_or(Map::new(&env));

        // If a previous lock exists, accumulate rather than replace.
        let existing_amount = locks
            .get(voter.clone())
            .map(|l| l.amount)
            .unwrap_or(0);

        let new_amount = existing_amount
            .checked_add(amount)
            .expect("lock amount overflow");

        let lock = TokenLock {
            voter: voter.clone(),
            amount: new_amount,
            locked_at: env.ledger().timestamp(),
        };

        locks.set(voter, lock);
        env.storage().instance().set(&LOCKS, &locks);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Unlock and return governance tokens to the voter.
    ///
    /// A voter may only unlock after all proposals they voted on have been
    /// finalized (Passed, Rejected, or Executed) — preventing double-spend
    /// of voting weight across overlapping proposals.
    pub fn unlock_tokens(env: Env, voter: Address) {
        voter.require_auth();

        // Check if voter has active votes on non-finalized proposals.
        let active_vote_count: Map<Address, u32> =
            env.storage().instance().get(&ACTIVE_VOTE_COUNT).unwrap_or(Map::new(&env));
        let count = active_vote_count.get(voter.clone()).unwrap_or(0);

        if count > 0 {
            panic!("cannot unlock tokens while having active votes on non-finalized proposals");
        }

        let mut locks: Map<Address, TokenLock> =
            env.storage().instance().get(&LOCKS).unwrap_or(Map::new(&env));

        let lock = locks.get(voter.clone()).expect("no token lock found for voter");
        let amount = lock.amount;

        // Transfer tokens back to voter.
        let token_address: Address = env.storage().instance().get(&TOKEN).expect("contract not initialized");
        let contract_address = env.current_contract_address();

        token::Client::new(&env, &token_address).transfer(
            &contract_address,
            &voter,
            &amount,
        );

        locks.remove(voter);
        env.storage().instance().set(&LOCKS, &locks);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    // ── View functions ────────────────────────────────────────────────────────

    /// Return a proposal by ID.
    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        let proposals: Map<u32, Proposal> =
            env.storage().instance().get(&PROPOSALS).unwrap_or(Map::new(&env));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        proposals.get(proposal_id)
    }

    /// Return the current vote record for a (voter, proposal_id) pair.
    pub fn get_vote(env: Env, voter: Address, proposal_id: u32) -> Option<VoteRecord> {
        let key = (voter, proposal_id);
        let all_votes: Map<(Address, u32), VoteRecord> =
            env.storage().instance().get(&VOTES).unwrap_or(Map::new(&env));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        all_votes.get(key)
    }

    /// Return the token lock for a voter.
    pub fn get_lock(env: Env, voter: Address) -> Option<TokenLock> {
        let locks: Map<Address, TokenLock> =
            env.storage().instance().get(&LOCKS).unwrap_or(Map::new(&env));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        locks.get(voter)
    }

    /// Return the next proposal ID that will be assigned.
    pub fn next_proposal_id(env: Env) -> u32 {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        env.storage().instance().get(&NEXT_ID).unwrap_or(0u32)
    }
}

#[cfg(test)]
mod test;