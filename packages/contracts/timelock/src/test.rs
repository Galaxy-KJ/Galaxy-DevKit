extern crate std;

use super::*;
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    vec, Address, Env, IntoVal, Symbol, Val, Vec,
};

const MIN_DELAY: u64 = 3_600;
const GRACE: u64 = 86_400;
const START: u64 = 1_000_000;

// ---------------------------------------------------------------------------
// Mock target: a counter only its admin (the timelock) can change.
// ---------------------------------------------------------------------------

#[contract]
pub struct Counter;

#[contractimpl]
impl Counter {
    pub fn init(env: Env, admin: Address) {
        env.storage()
            .instance()
            .set(&symbol_short!("admin"), &admin);
    }

    pub fn set(env: Env, value: u32) -> u32 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&symbol_short!("admin"))
            .unwrap();
        admin.require_auth();
        env.storage()
            .instance()
            .set(&symbol_short!("value"), &value);
        value
    }

    pub fn get(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&symbol_short!("value"))
            .unwrap_or(0)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

struct Setup<'a> {
    env: Env,
    admin: Address,
    timelock_id: Address,
    timelock: TimelockContractClient<'a>,
    counter_id: Address,
    counter: CounterClient<'a>,
}

/// Initialized timelock and counter, with the counter owned by the timelock.
/// `mock_all` selects whether every auth is mocked.
fn setup(mock_all: bool) -> Setup<'static> {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = START);

    let admin = Address::generate(&env);
    let timelock_id = env.register_contract(None, TimelockContract);
    let timelock = TimelockContractClient::new(&env, &timelock_id);
    let counter_id = env.register_contract(None, Counter);
    let counter = CounterClient::new(&env, &counter_id);

    env.mock_all_auths();
    timelock.initialize(&admin, &MIN_DELAY, &GRACE);
    counter.init(&timelock_id);
    if !mock_all {
        // Drop the blanket mock; each test mocks exactly the auth it signs.
        env.set_auths(&[]);
    }

    Setup {
        env,
        admin,
        timelock_id,
        timelock,
        counter_id,
        counter,
    }
}

fn set_args(env: &Env, value: u32) -> Vec<Val> {
    vec![env, value.into_val(env)]
}

fn set_fn() -> Symbol {
    symbol_short!("set")
}

fn queue(s: &Setup, value: u32, eta: u64) -> BytesN<32> {
    s.timelock
        .queue_transaction(&s.counter_id, &set_fn(), &set_args(&s.env, value), &eta)
}

/// The error a failed client call reports for `e`.
fn err(e: TimelockError) -> soroban_sdk::Error {
    e.into()
}

/// The error `execute_transaction` fails with (its `Val` result has no `PartialEq`).
fn execute_err(s: &Setup, tx_hash: &BytesN<32>) -> soroban_sdk::Error {
    match s.timelock.try_execute_transaction(tx_hash) {
        Err(Ok(e)) => e,
        Err(Err(e)) => panic!("expected a contract error, got {:?}", e),
        Ok(_) => panic!("expected execute_transaction to fail"),
    }
}

fn warp(env: &Env, timestamp: u64) {
    env.ledger().with_mut(|l| l.timestamp = timestamp);
}

/// Mocks a signature by `signer` for `fn_name(args)` on the timelock.
fn sign(s: &Setup, signer: &Address, fn_name: &str, args: Vec<Val>) {
    s.env.mock_auths(&[MockAuth {
        address: signer,
        invoke: &MockAuthInvoke {
            contract: &s.timelock_id,
            fn_name,
            args,
            sub_invokes: &[],
        },
    }]);
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_stores_config() {
    let s = setup(true);
    assert_eq!(s.timelock.get_admin(), s.admin);
    assert_eq!(s.timelock.get_min_delay(), MIN_DELAY);
    assert_eq!(s.timelock.get_grace_period(), GRACE);
}

#[test]
fn test_initialize_twice_fails() {
    let s = setup(true);
    let other = Address::generate(&s.env);
    assert_eq!(
        s.timelock.try_initialize(&other, &MIN_DELAY, &GRACE),
        Err(Ok(err(TimelockError::AlreadyInitialized)))
    );
}

#[test]
fn test_initialize_requires_admin_auth() {
    let env = Env::default();
    let id = env.register_contract(None, TimelockContract);
    let client = TimelockContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    assert!(client.try_initialize(&admin, &MIN_DELAY, &GRACE).is_err());
}

#[test]
fn test_initialize_rejects_invalid_params() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, TimelockContract);
    let client = TimelockContractClient::new(&env, &id);
    let admin = Address::generate(&env);

    assert_eq!(
        client.try_initialize(&admin, &0, &GRACE),
        Err(Ok(err(TimelockError::InvalidDelay)))
    );
    assert_eq!(
        client.try_initialize(&admin, &(MAXIMUM_DELAY + 1), &GRACE),
        Err(Ok(err(TimelockError::InvalidDelay)))
    );
    assert_eq!(
        client.try_initialize(&admin, &MIN_DELAY, &0),
        Err(Ok(err(TimelockError::InvalidGracePeriod)))
    );
    assert_eq!(
        client.try_initialize(&admin, &MIN_DELAY, &(MAXIMUM_GRACE_PERIOD + 1)),
        Err(Ok(err(TimelockError::InvalidGracePeriod)))
    );
}

#[test]
fn test_calls_before_initialize_fail() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, TimelockContract);
    let client = TimelockContractClient::new(&env, &id);
    let target = Address::generate(&env);

    assert_eq!(
        client.try_queue_transaction(&target, &set_fn(), &vec![&env], &(START + MIN_DELAY)),
        Err(Ok(err(TimelockError::NotInitialized)))
    );
}

// ---------------------------------------------------------------------------
// Authorization (no mock_all_auths)
// ---------------------------------------------------------------------------

#[test]
fn test_non_admin_cannot_queue() {
    let s = setup(false);
    let attacker = Address::generate(&s.env);
    let args = set_args(&s.env, 7);
    let eta = START + MIN_DELAY;

    sign(
        &s,
        &attacker,
        "queue_transaction",
        (s.counter_id.clone(), set_fn(), args.clone(), eta).into_val(&s.env),
    );
    assert!(s
        .timelock
        .try_queue_transaction(&s.counter_id, &set_fn(), &args, &eta)
        .is_err());

    // No signature at all fails too.
    s.env.set_auths(&[]);
    assert!(s
        .timelock
        .try_queue_transaction(&s.counter_id, &set_fn(), &args, &eta)
        .is_err());
}

#[test]
fn test_admin_can_queue_with_real_auth() {
    let s = setup(false);
    let args = set_args(&s.env, 7);
    let eta = START + MIN_DELAY;

    sign(
        &s,
        &s.admin,
        "queue_transaction",
        (s.counter_id.clone(), set_fn(), args.clone(), eta).into_val(&s.env),
    );
    let tx_hash = s
        .timelock
        .queue_transaction(&s.counter_id, &set_fn(), &args, &eta);
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_some());
}

#[test]
fn test_non_admin_cannot_execute() {
    let s = setup(false);
    let args = set_args(&s.env, 7);
    let eta = START + MIN_DELAY;
    sign(
        &s,
        &s.admin,
        "queue_transaction",
        (s.counter_id.clone(), set_fn(), args.clone(), eta).into_val(&s.env),
    );
    let tx_hash = s
        .timelock
        .queue_transaction(&s.counter_id, &set_fn(), &args, &eta);

    warp(&s.env, eta);
    let attacker = Address::generate(&s.env);
    sign(
        &s,
        &attacker,
        "execute_transaction",
        (tx_hash.clone(),).into_val(&s.env),
    );
    assert!(s.timelock.try_execute_transaction(&tx_hash).is_err());
    assert_eq!(s.counter.get(), 0);
    assert!(!s.timelock.is_executed(&tx_hash));
}

#[test]
fn test_non_admin_cannot_revoke() {
    let s = setup(false);
    let args = set_args(&s.env, 7);
    let eta = START + MIN_DELAY;
    sign(
        &s,
        &s.admin,
        "queue_transaction",
        (s.counter_id.clone(), set_fn(), args.clone(), eta).into_val(&s.env),
    );
    let tx_hash = s
        .timelock
        .queue_transaction(&s.counter_id, &set_fn(), &args, &eta);

    let attacker = Address::generate(&s.env);
    sign(
        &s,
        &attacker,
        "revoke_transaction",
        (tx_hash.clone(),).into_val(&s.env),
    );
    assert!(s.timelock.try_revoke_transaction(&tx_hash).is_err());
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_some());
}

#[test]
fn test_admin_executes_with_real_auth_and_target_sees_timelock_as_caller() {
    let s = setup(false);
    let args = set_args(&s.env, 42);
    let eta = START + MIN_DELAY;
    sign(
        &s,
        &s.admin,
        "queue_transaction",
        (s.counter_id.clone(), set_fn(), args.clone(), eta).into_val(&s.env),
    );
    let tx_hash = s
        .timelock
        .queue_transaction(&s.counter_id, &set_fn(), &args, &eta);

    warp(&s.env, eta);
    // Only the admin's signature on execute is mocked. The counter's
    // `timelock.require_auth()` passes because the timelock is the direct
    // invoker.
    sign(
        &s,
        &s.admin,
        "execute_transaction",
        (tx_hash.clone(),).into_val(&s.env),
    );
    s.timelock.execute_transaction(&tx_hash);

    assert_eq!(s.counter.get(), 42);
    assert!(s.timelock.is_executed(&tx_hash));
}

#[test]
fn test_target_rejects_direct_call_from_non_timelock() {
    let s = setup(false);
    assert!(s.counter.try_set(&9).is_err());
    assert_eq!(s.counter.get(), 0);
}

// ---------------------------------------------------------------------------
// queue_transaction
// ---------------------------------------------------------------------------

#[test]
fn test_queue_stores_call() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 5, eta);

    let tx = s.timelock.get_queued_transaction(&tx_hash).unwrap();
    assert_eq!(tx.target, s.counter_id);
    assert_eq!(tx.fn_name, set_fn());
    assert_eq!(tx.args, set_args(&s.env, 5));
    assert_eq!(tx.eta, eta);
    assert_eq!(tx.queued_at, START);
    assert_eq!(
        s.timelock
            .hash_transaction(&s.counter_id, &set_fn(), &set_args(&s.env, 5), &eta),
        tx_hash
    );
}

#[test]
fn test_queue_enforces_min_delay() {
    let s = setup(true);
    assert_eq!(
        s.timelock.try_queue_transaction(
            &s.counter_id,
            &set_fn(),
            &set_args(&s.env, 1),
            &(START + 1)
        ),
        Err(Ok(err(TimelockError::EtaTooEarly)))
    );
    assert_eq!(
        s.timelock.try_queue_transaction(
            &s.counter_id,
            &set_fn(),
            &set_args(&s.env, 1),
            &(START + MIN_DELAY - 1)
        ),
        Err(Ok(err(TimelockError::EtaTooEarly)))
    );
    // Exactly `now + min_delay` is allowed.
    queue(&s, 1, START + MIN_DELAY);
}

#[test]
fn test_queue_rejects_eta_beyond_maximum_delay() {
    let s = setup(true);
    assert_eq!(
        s.timelock.try_queue_transaction(
            &s.counter_id,
            &set_fn(),
            &set_args(&s.env, 1),
            &(START + MAXIMUM_DELAY + 1)
        ),
        Err(Ok(err(TimelockError::EtaTooLate)))
    );
    queue(&s, 1, START + MAXIMUM_DELAY);
}

#[test]
fn test_queue_duplicate_fails() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    queue(&s, 1, eta);
    assert_eq!(
        s.timelock
            .try_queue_transaction(&s.counter_id, &set_fn(), &set_args(&s.env, 1), &eta),
        Err(Ok(err(TimelockError::AlreadyQueued)))
    );
}

#[test]
fn test_queue_multiple_transactions_get_distinct_hashes() {
    let s = setup(true);
    let h1 = queue(&s, 1, START + MIN_DELAY);
    let h2 = queue(&s, 2, START + MIN_DELAY);
    let h3 = queue(&s, 1, START + MIN_DELAY + 1);
    assert_ne!(h1, h2);
    assert_ne!(h1, h3);
    assert!(s.timelock.get_queued_transaction(&h1).is_some());
    assert!(s.timelock.get_queued_transaction(&h2).is_some());
    assert!(s.timelock.get_queued_transaction(&h3).is_some());
}

#[test]
fn test_queue_emits_event() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 3, eta);

    let last = s.env.events().all().last().unwrap();
    assert_eq!(last.0, s.timelock_id);
    assert_eq!(last.1, (symbol_short!("queued"), tx_hash).into_val(&s.env));
}

// ---------------------------------------------------------------------------
// execute_transaction
// ---------------------------------------------------------------------------

#[test]
fn test_execute_invokes_target_and_changes_state() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 99, eta);
    assert_eq!(s.counter.get(), 0);

    warp(&s.env, eta + 10);
    let result = s.timelock.execute_transaction(&tx_hash);

    assert_eq!(s.counter.get(), 99);
    let returned: u32 = soroban_sdk::FromVal::from_val(&s.env, &result);
    assert_eq!(returned, 99);
    assert!(s.timelock.is_executed(&tx_hash));
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_none());

    let last = s.env.events().all().last().unwrap();
    assert_eq!(
        last.1,
        (symbol_short!("executed"), tx_hash).into_val(&s.env)
    );
}

#[test]
fn test_execute_before_eta_fails() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 1, eta);

    warp(&s.env, eta - 1);
    assert_eq!(execute_err(&s, &tx_hash), err(TimelockError::NotReady));
    assert_eq!(s.counter.get(), 0);
}

#[test]
fn test_execute_at_end_of_grace_period_succeeds() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 4, eta);

    warp(&s.env, eta + GRACE);
    s.timelock.execute_transaction(&tx_hash);
    assert_eq!(s.counter.get(), 4);
}

#[test]
fn test_execute_after_grace_period_fails() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 4, eta);

    warp(&s.env, eta + GRACE + 1);
    assert_eq!(execute_err(&s, &tx_hash), err(TimelockError::Expired));
    assert_eq!(s.counter.get(), 0);
    assert!(!s.timelock.is_executed(&tx_hash));
}

#[test]
fn test_execute_twice_fails() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 1, eta);

    warp(&s.env, eta);
    s.timelock.execute_transaction(&tx_hash);
    assert_eq!(
        execute_err(&s, &tx_hash),
        err(TimelockError::AlreadyExecuted)
    );
}

#[test]
fn test_execute_unknown_hash_fails() {
    let s = setup(true);
    let unknown = BytesN::from_array(&s.env, &[7u8; 32]);
    assert_eq!(execute_err(&s, &unknown), err(TimelockError::NotQueued));
}

#[test]
fn test_failed_target_call_rolls_back() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    // `get` takes no arguments, so passing one makes the call fail.
    let tx_hash = s.timelock.queue_transaction(
        &s.counter_id,
        &symbol_short!("get"),
        &set_args(&s.env, 1),
        &eta,
    );

    warp(&s.env, eta);
    assert!(s.timelock.try_execute_transaction(&tx_hash).is_err());
    assert!(!s.timelock.is_executed(&tx_hash));
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_some());
}

// ---------------------------------------------------------------------------
// revoke_transaction
// ---------------------------------------------------------------------------

#[test]
fn test_revoke_removes_and_blocks_execution() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 1, eta);

    s.timelock.revoke_transaction(&tx_hash);
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_none());

    let last = s.env.events().all().last().unwrap();
    assert_eq!(
        last.1,
        (symbol_short!("cancelled"), tx_hash.clone()).into_val(&s.env)
    );

    warp(&s.env, eta);
    assert_eq!(execute_err(&s, &tx_hash), err(TimelockError::NotQueued));
    assert_eq!(s.counter.get(), 0);
}

#[test]
fn test_revoke_after_eta_before_execution_succeeds() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 1, eta);

    warp(&s.env, eta + 1);
    s.timelock.revoke_transaction(&tx_hash);
    assert!(s.timelock.get_queued_transaction(&tx_hash).is_none());
}

#[test]
fn test_revoke_executed_fails() {
    let s = setup(true);
    let eta = START + MIN_DELAY;
    let tx_hash = queue(&s, 1, eta);

    warp(&s.env, eta);
    s.timelock.execute_transaction(&tx_hash);
    assert_eq!(
        s.timelock.try_revoke_transaction(&tx_hash),
        Err(Ok(err(TimelockError::NotQueued)))
    );
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

#[test]
fn test_queued_tx_is_persistent_entry_with_ttl() {
    let s = setup(true);
    s.env.ledger().with_mut(|l| l.sequence_number = 100);
    let tx_hash = queue(&s, 1, START + MIN_DELAY);

    let (persistent_ttl, instance_ttl) = s.env.as_contract(&s.timelock_id, || {
        let key = DataKey::Queued(tx_hash.clone());
        assert!(s.env.storage().persistent().has(&key));
        (
            s.env.storage().persistent().get_ttl(&key),
            s.env.storage().instance().get_ttl(),
        )
    });
    assert_eq!(persistent_ttl, PERSISTENT_TTL_EXTEND);
    assert_eq!(instance_ttl, PERSISTENT_TTL_EXTEND);
}

#[test]
fn test_execute_works_late_in_entry_lifetime() {
    let s = setup(true);
    s.env.ledger().with_mut(|l| l.sequence_number = 100);
    let eta = START + MAXIMUM_DELAY;
    let tx_hash = queue(&s, 8, eta);
    // The mock target does not manage its own TTL; keep it alive so only the
    // timelock's entries are under test.
    s.env.as_contract(&s.counter_id, || {
        s.env
            .storage()
            .instance()
            .extend_ttl(PERSISTENT_TTL_EXTEND, PERSISTENT_TTL_EXTEND)
    });

    // Ledgers close roughly every 5 s; jump to the last ledger of the
    // entry's TTL window and execute at the end of the grace period.
    s.env.ledger().with_mut(|l| {
        l.timestamp = eta + GRACE;
        l.sequence_number = 100 + PERSISTENT_TTL_EXTEND - 1;
    });
    s.timelock.execute_transaction(&tx_hash);
    assert_eq!(s.counter.get(), 8);
}
