extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        storage::{Instance as _, Persistent as _},
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, IssuerFlags,
        Ledger as _, MockAuth, MockAuthInvoke, StellarAssetContract,
    },
    token::{Client as TokenClient, StellarAssetClient},
    vec, IntoVal, Symbol,
};

const START: u64 = 1_000;
const CLIFF: u64 = 1_000;
const DURATION: u64 = 4_000;
const TOTAL: i128 = 100_000_000;
const FOUR_YEARS: u64 = 4 * 365 * 24 * 60 * 60;

/// Functions panic with `panic_with_error!`, so `try_*` surfaces the code as
/// a plain `soroban_sdk::Error`.
fn err(e: VestingError) -> soroban_sdk::Error {
    e.into()
}

struct Setup {
    env: Env,
    id: Address,
    client: VestingContractClient<'static>,
    token: TokenClient<'static>,
    sac: StellarAssetClient<'static>,
    asset: StellarAssetContract,
    admin: Address,
    funder: Address,
    beneficiary: Address,
}

impl Setup {
    /// Initialized contract, a Stellar Asset Contract and a funder holding `mint`.
    /// Auths are mocked; tests that check auth switch them off or mock exact ones.
    fn new(mint: i128) -> Self {
        let env = Env::default();
        env.ledger().with_mut(|l| {
            l.timestamp = 500;
            l.sequence_number = 100;
        });
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let funder = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let asset = env.register_stellar_asset_contract_v2(Address::generate(&env));
        let token_id = asset.address();
        let token = TokenClient::new(&env, &token_id);
        let sac = StellarAssetClient::new(&env, &token_id);
        sac.mint(&funder, &mint);

        let id = env.register_contract(None, VestingContract);
        let client = VestingContractClient::new(&env, &id);
        client.initialize(&admin, &token_id);

        Setup {
            env,
            id,
            client,
            token,
            sac,
            asset,
            admin,
            funder,
            beneficiary,
        }
    }

    fn create_default(&self) {
        self.client.create_schedule(
            &self.funder,
            &self.beneficiary,
            &TOTAL,
            &START,
            &CLIFF,
            &DURATION,
        );
    }

    /// Lets the issuer deauthorize balances, to simulate an address that
    /// cannot receive tokens.
    fn deauthorize(&self, address: &Address) {
        self.asset.issuer().set_flag(IssuerFlags::RevocableFlag);
        self.sac.set_authorized(address, &false);
    }

    fn at(&self, timestamp: u64) {
        self.env.ledger().with_mut(|l| l.timestamp = timestamp);
    }

    /// Moves the ledger sequence to `target` in steps, reading the contract's
    /// token balance on the way so the Stellar Asset Contract's instance and
    /// that balance entry do not expire.
    fn advance_keeping_token_alive(&self, target: u32) {
        while self.env.ledger().sequence() < target {
            let next = (self.env.ledger().sequence() + 100_000).min(target);
            self.env.ledger().with_mut(|l| l.sequence_number = next);
            self.token.balance(&self.id);
        }
    }

    /// (funder, contract, beneficiary) token balances.
    fn balances(&self) -> (i128, i128, i128) {
        (
            self.token.balance(&self.funder),
            self.token.balance(&self.id),
            self.token.balance(&self.beneficiary),
        )
    }

    /// Only `address` signs a call to `fn_name(args)`, with no nested auth.
    fn mock_single(
        &self,
        address: &Address,
        fn_name: &str,
        args: soroban_sdk::Vec<soroban_sdk::Val>,
    ) {
        self.env.mock_auths(&[MockAuth {
            address,
            invoke: &MockAuthInvoke {
                contract: &self.id,
                fn_name,
                args,
                sub_invokes: &[],
            },
        }]);
    }

    /// The most recent event this contract published. Events accumulate across
    /// invocations in the test env, and token transfers add their own.
    /// Returned as a one-element `Vec` because `Val` has no `PartialEq`.
    #[allow(clippy::type_complexity)]
    fn last_event(
        &self,
    ) -> soroban_sdk::Vec<(
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    )> {
        let mut last = None;
        for e in self.env.events().all().iter() {
            if e.0 == self.id {
                last = Some(e);
            }
        }
        vec![&self.env, last.expect("no event from the vesting contract")]
    }
}

// ===========================================================================
// Acceptance criterion 1: real token, balances at cliff, mid-vesting and end
// ===========================================================================

#[test]
fn test_balances_at_cliff_mid_and_end() {
    let t = Setup::new(TOTAL);
    assert_eq!(t.balances(), (TOTAL, 0, 0));

    t.create_default();
    assert_eq!(
        t.balances(),
        (0, TOTAL, 0),
        "deposit moves into the contract"
    );

    // At the cliff (start + 1000 of 4000): 25% has vested.
    t.at(START + CLIFF);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), 25_000_000);
    assert_eq!(t.balances(), (0, 75_000_000, 25_000_000));

    // Mid-vesting (start + 2000): 50% in total.
    t.at(START + DURATION / 2);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), 25_000_000);
    assert_eq!(t.balances(), (0, 50_000_000, 50_000_000));

    // End and beyond: everything.
    t.at(START + DURATION + 10_000);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), 50_000_000);
    assert_eq!(t.balances(), (0, 0, TOTAL));
    assert_eq!(t.client.get_claimed_amount(&t.beneficiary), TOTAL);
}

// ===========================================================================
// Acceptance criterion 2: an unauthorized claim fails
// ===========================================================================

#[test]
fn test_claim_without_auth_fails() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION);

    t.env.set_auths(&[]);
    assert!(t.client.try_claim_tokens(&t.beneficiary).is_err());
    assert_eq!(t.balances(), (0, TOTAL, 0));
    assert_eq!(t.client.get_claimed_amount(&t.beneficiary), 0);
}

#[test]
fn test_claim_signed_by_other_address_fails() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION);

    let attacker = Address::generate(&t.env);
    t.mock_single(
        &attacker,
        "claim_tokens",
        (t.beneficiary.clone(),).into_val(&t.env),
    );
    assert!(t.client.try_claim_tokens(&t.beneficiary).is_err());
    assert_eq!(t.balances(), (0, TOTAL, 0));
}

#[test]
fn test_claim_signed_by_beneficiary_succeeds() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION);

    t.mock_single(
        &t.beneficiary,
        "claim_tokens",
        (t.beneficiary.clone(),).into_val(&t.env),
    );
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL);
    assert_eq!(
        t.env.auths(),
        std::vec![(
            t.beneficiary.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.id.clone(),
                    Symbol::new(&t.env, "claim_tokens"),
                    (t.beneficiary.clone(),).into_val(&t.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    assert_eq!(t.balances(), (0, 0, TOTAL));
}

// ===========================================================================
// Acceptance criterion 3: extreme total_amount values do not overflow
// ===========================================================================

#[test]
fn test_i128_max_vests_and_pays_in_full() {
    let t = Setup::new(i128::MAX);
    t.client.create_schedule(
        &t.funder,
        &t.beneficiary,
        &i128::MAX,
        &START,
        &0,
        &FOUR_YEARS,
    );

    let mut paid: i128 = 0;
    for elapsed in [1, FOUR_YEARS / 4, FOUR_YEARS / 2, FOUR_YEARS - 1] {
        t.at(START + elapsed);
        let expected = vested_amount(i128::MAX, elapsed, FOUR_YEARS).unwrap();
        assert_eq!(t.client.get_vested_amount(&t.beneficiary), expected);
        paid += t.client.claim_tokens(&t.beneficiary);
        assert_eq!(paid, expected);
    }
    t.at(START + FOUR_YEARS);
    paid += t.client.claim_tokens(&t.beneficiary);
    assert_eq!(paid, i128::MAX);
    assert_eq!(t.balances(), (0, 0, i128::MAX));
}

/// The schedule that used to trap at maturity (`total * duration` overflowed
/// for any total above `i128::MAX / duration`) now completes.
#[test]
fn test_amount_above_old_overflow_threshold_completes() {
    let total = i128::MAX / FOUR_YEARS as i128 + 1;
    let t = Setup::new(total);
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &total, &START, &0, &FOUR_YEARS);

    t.at(START + FOUR_YEARS - 1);
    let first = t.client.claim_tokens(&t.beneficiary);
    t.at(START + FOUR_YEARS);
    let last = t.client.claim_tokens(&t.beneficiary);
    assert!(last > 0);
    assert_eq!(first + last, total);
    assert_eq!(t.balances(), (0, 0, total));
}

#[test]
fn test_vested_amount_matches_naive_formula() {
    let totals = [
        1i128,
        3,
        7,
        999_999_937,
        10_i128.pow(18),
        10_i128.pow(30),
        i128::MAX / 3,
        i128::MAX,
    ];
    let durations = [1u64, 2, 3, 7, 4_000, 86_400, FOUR_YEARS, u64::MAX];
    for &total in &totals {
        for &duration in &durations {
            let mut elapsed_points = std::vec![
                0,
                1,
                duration / 3,
                duration / 2,
                duration.saturating_sub(1),
                duration
            ];
            elapsed_points.sort();
            let mut previous = 0;
            for elapsed in elapsed_points {
                let v = vested_amount(total, elapsed, duration).unwrap();
                if let Some(product) = total.checked_mul(elapsed as i128) {
                    assert_eq!(
                        v,
                        product / duration as i128,
                        "{total} {elapsed} {duration}"
                    );
                }
                assert!(v >= previous && v <= total, "monotonic and bounded");
                previous = v;
            }
            assert_eq!(vested_amount(total, duration, duration), Some(total));
        }
    }
}

#[test]
fn test_vested_amount_edge_inputs() {
    assert_eq!(vested_amount(100, 5, 0), None);
    assert_eq!(vested_amount(-1, 5, 10), None);
    assert_eq!(vested_amount(0, 5, 10), Some(0));
    assert_eq!(vested_amount(100, 0, 10), Some(0));
    assert_eq!(vested_amount(100, 11, 10), Some(100));
    assert_eq!(
        vested_amount(i128::MAX, u64::MAX - 1, u64::MAX),
        Some(
            // q * e + floor(r * e / d), computed by hand for the widest inputs
            (i128::MAX / u64::MAX as i128) * (u64::MAX - 1) as i128
                + (((i128::MAX % u64::MAX as i128) as u128) * (u64::MAX - 1) as u128
                    / u64::MAX as u128) as i128
        )
    );
}

// ===========================================================================
// initialize
// ===========================================================================

#[test]
fn test_initialize_stores_admin_and_token() {
    let t = Setup::new(0);
    assert_eq!(t.client.get_admin(), t.admin);
    assert_eq!(t.client.get_token(), t.token.address);
}

#[test]
fn test_initialize_twice_fails() {
    let t = Setup::new(0);
    let other = Address::generate(&t.env);
    assert_eq!(
        t.client.try_initialize(&other, &t.token.address),
        Err(Ok(err(VestingError::AlreadyInitialized)))
    );
    assert_eq!(t.client.get_admin(), t.admin);
}

#[test]
fn test_initialize_requires_admin_auth() {
    let env = Env::default();
    let id = env.register_contract(None, VestingContract);
    let client = VestingContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    assert!(client.try_initialize(&admin, &token).is_err());
    assert_eq!(
        client.try_get_admin(),
        Err(Ok(err(VestingError::NotInitialized)))
    );
}

#[test]
fn test_create_before_initialize_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, VestingContract);
    let client = VestingContractClient::new(&env, &id);
    let funder = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    assert_eq!(
        client.try_create_schedule(&funder, &beneficiary, &TOTAL, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::NotInitialized)))
    );
}

// ===========================================================================
// create_schedule
// ===========================================================================

#[test]
fn test_create_requires_funder_auth_covering_the_deposit() {
    let t = Setup::new(TOTAL);
    t.create_default();
    assert_eq!(
        t.env.auths(),
        std::vec![(
            t.funder.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.id.clone(),
                    Symbol::new(&t.env, "create_schedule"),
                    (
                        t.funder.clone(),
                        t.beneficiary.clone(),
                        TOTAL,
                        START,
                        CLIFF,
                        DURATION
                    )
                        .into_val(&t.env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        t.token.address.clone(),
                        Symbol::new(&t.env, "transfer"),
                        (t.funder.clone(), t.id.clone(), TOTAL).into_val(&t.env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );
    let schedule = t.client.get_schedule(&t.beneficiary).unwrap();
    assert_eq!(
        schedule,
        VestingSchedule {
            funder: t.funder.clone(),
            beneficiary: t.beneficiary.clone(),
            total_amount: TOTAL,
            claimed: 0,
            start: START,
            cliff: CLIFF,
            duration: DURATION,
            revoked: false,
        }
    );
}

#[test]
fn test_create_without_auth_fails() {
    let t = Setup::new(TOTAL);
    t.env.set_auths(&[]);
    assert!(t
        .client
        .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &CLIFF, &DURATION)
        .is_err());
    assert_eq!(t.balances(), (TOTAL, 0, 0));
    assert_eq!(t.client.get_schedule(&t.beneficiary), None);
}

#[test]
fn test_create_signed_by_other_address_fails() {
    let t = Setup::new(TOTAL);
    let attacker = Address::generate(&t.env);
    t.mock_single(
        &attacker,
        "create_schedule",
        (
            t.funder.clone(),
            t.beneficiary.clone(),
            TOTAL,
            START,
            CLIFF,
            DURATION,
        )
            .into_val(&t.env),
    );
    assert!(t
        .client
        .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &CLIFF, &DURATION)
        .is_err());
    assert_eq!(t.balances(), (TOTAL, 0, 0));
}

#[test]
fn test_create_with_insufficient_balance_fails() {
    let t = Setup::new(TOTAL - 1);
    assert!(t
        .client
        .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &CLIFF, &DURATION)
        .is_err());
    assert_eq!(t.client.get_schedule(&t.beneficiary), None, "rolled back");
    assert_eq!(t.token.balance(&t.funder), TOTAL - 1);
}

#[test]
fn test_create_rejects_zero_amount() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.beneficiary, &0, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::InvalidAmount)))
    );
}

#[test]
fn test_create_rejects_negative_amount() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.beneficiary, &-1, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::InvalidAmount)))
    );
}

#[test]
fn test_create_rejects_zero_duration() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &0, &0),
        Err(Ok(err(VestingError::InvalidDuration)))
    );
}

#[test]
fn test_create_rejects_cliff_longer_than_duration() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client.try_create_schedule(
            &t.funder,
            &t.beneficiary,
            &TOTAL,
            &START,
            &(DURATION + 1),
            &DURATION
        ),
        Err(Ok(err(VestingError::CliffExceedsDuration)))
    );
}

#[test]
fn test_create_rejects_end_time_overflow() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client.try_create_schedule(
            &t.funder,
            &t.beneficiary,
            &TOTAL,
            &(u64::MAX - 10),
            &100,
            &100
        ),
        Err(Ok(err(VestingError::TimeOverflow)))
    );
}

#[test]
fn test_create_rejects_contract_as_beneficiary() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.id, &TOTAL, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::InvalidBeneficiary)))
    );
}

#[test]
fn test_create_duplicate_fails() {
    let t = Setup::new(2 * TOTAL);
    t.create_default();
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::ScheduleExists)))
    );
    assert_eq!(t.balances(), (TOTAL, TOTAL, 0), "second deposit not taken");
}

#[test]
fn test_create_replaces_a_fully_claimed_schedule() {
    let t = Setup::new(2 * TOTAL);
    t.create_default();
    t.at(START + DURATION);
    t.client.claim_tokens(&t.beneficiary);

    t.client.create_schedule(
        &t.funder,
        &t.beneficiary,
        &TOTAL,
        &START,
        &0,
        &(3 * DURATION),
    );
    let schedule = t.client.get_schedule(&t.beneficiary).unwrap();
    assert_eq!((schedule.claimed, schedule.duration), (0, 3 * DURATION));
    assert_eq!(t.balances(), (0, TOTAL, TOTAL));
}

#[test]
fn test_create_waits_until_a_revoked_schedule_is_claimed() {
    let t = Setup::new(2 * TOTAL);
    t.create_default();
    t.at(START + DURATION / 2);
    t.client.revoke_schedule(&t.beneficiary);
    assert_eq!(
        t.client
            .try_create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &CLIFF, &DURATION),
        Err(Ok(err(VestingError::ScheduleExists)))
    );
    t.client.claim_tokens(&t.beneficiary);
    t.create_default();
    assert!(!t.client.get_schedule(&t.beneficiary).unwrap().revoked);
}

/// A third party can still fund a tiny schedule for someone else's address,
/// but it costs them tokens and the admin can clear it.
#[test]
fn test_squatted_beneficiary_is_freed_by_revoke() {
    let t = Setup::new(TOTAL);
    let squatter = Address::generate(&t.env);
    t.sac.mint(&squatter, &1);
    t.client
        .create_schedule(&squatter, &t.beneficiary, &1, &START, &0, &(u64::MAX / 2));

    assert_eq!(t.client.revoke_schedule(&t.beneficiary), (0, 1));
    assert_eq!(t.token.balance(&squatter), 1, "squatter refunded");

    t.create_default();
    assert_eq!(
        t.client.get_schedule(&t.beneficiary).unwrap().funder,
        t.funder
    );
}

// ===========================================================================
// Time and schedule shape
// ===========================================================================

#[test]
fn test_cliff_boundaries() {
    let t = Setup::new(TOTAL);
    t.create_default();

    t.at(START + CLIFF - 1);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), 0);
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::CliffNotReached)))
    );

    t.at(START + CLIFF);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), TOTAL / 4);

    t.at(START + CLIFF + 1);
    assert_eq!(
        t.client.get_vested_amount(&t.beneficiary),
        TOTAL * (CLIFF as i128 + 1) / DURATION as i128
    );
}

#[test]
fn test_backdated_start_is_partly_vested() {
    let t = Setup::new(TOTAL);
    t.at(10_000);
    // Started 1000 s ago, no cliff, 4000 s long.
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &TOTAL, &9_000, &0, &DURATION);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL / 4);
    assert_eq!(t.balances(), (0, TOTAL * 3 / 4, TOTAL / 4));
}

#[test]
fn test_future_start_with_no_cliff_vests_nothing_before_start() {
    let t = Setup::new(TOTAL);
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &TOTAL, &START, &0, &DURATION);
    t.at(START - 1);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), 0);
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::CliffNotReached)))
    );
    t.at(START);
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::NothingToClaim)))
    );
}

#[test]
fn test_cliff_equal_to_duration_releases_everything_at_the_end() {
    let t = Setup::new(TOTAL);
    t.client.create_schedule(
        &t.funder,
        &t.beneficiary,
        &TOTAL,
        &START,
        &DURATION,
        &DURATION,
    );
    t.at(START + DURATION - 1);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), 0);
    t.at(START + DURATION);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL);
}

// ===========================================================================
// Claims
// ===========================================================================

#[test]
fn test_many_claims_with_odd_numbers_pay_exactly_the_total() {
    let total: i128 = 1_000_003;
    let duration: u64 = 7;
    let t = Setup::new(total);
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &total, &START, &0, &duration);

    let mut paid = 0;
    for second in 1..=duration {
        t.at(START + second);
        paid += t.client.claim_tokens(&t.beneficiary);
        assert_eq!(paid, total * second as i128 / duration as i128);
        assert_eq!(t.client.get_claimed_amount(&t.beneficiary), paid);
    }
    assert_eq!(paid, total);
    assert_eq!(t.balances(), (0, 0, total));
}

#[test]
fn test_claim_with_nothing_new_fails() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + 2_000);
    t.client.claim_tokens(&t.beneficiary);
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::NothingToClaim)))
    );
}

#[test]
fn test_claim_after_fully_claimed_fails() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION);
    t.client.claim_tokens(&t.beneficiary);
    t.at(START + 10 * DURATION);
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::NothingToClaim)))
    );
    assert_eq!(t.balances(), (0, 0, TOTAL));
}

#[test]
fn test_funder_can_be_the_beneficiary() {
    let t = Setup::new(TOTAL);
    t.client
        .create_schedule(&t.funder, &t.funder, &TOTAL, &START, &CLIFF, &DURATION);
    t.at(START + DURATION);
    assert_eq!(t.client.claim_tokens(&t.funder), TOTAL);
    assert_eq!(t.token.balance(&t.funder), TOTAL);
}

#[test]
fn test_reads_for_unknown_beneficiary() {
    let t = Setup::new(TOTAL);
    let nobody = Address::generate(&t.env);
    assert_eq!(t.client.get_schedule(&nobody), None);
    assert_eq!(t.client.get_claimed_amount(&nobody), 0);
    assert_eq!(
        t.client.try_get_vested_amount(&nobody),
        Err(Ok(err(VestingError::ScheduleNotFound)))
    );
    assert_eq!(
        t.client.try_claim_tokens(&nobody),
        Err(Ok(err(VestingError::ScheduleNotFound)))
    );
}

#[test]
fn test_schedules_are_independent() {
    let t = Setup::new(2 * TOTAL);
    let other = Address::generate(&t.env);
    t.create_default();
    t.client
        .create_schedule(&t.funder, &other, &TOTAL, &START, &0, &(2 * DURATION));
    t.at(START + DURATION);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL);
    assert_eq!(t.client.claim_tokens(&other), TOTAL / 2);
    assert_eq!(t.token.balance(&t.id), TOTAL / 2);
}

// ===========================================================================
// revoke_schedule
// ===========================================================================

#[test]
fn test_revoke_during_cliff_refunds_everything() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + CLIFF - 1);
    assert_eq!(t.client.revoke_schedule(&t.beneficiary), (0, TOTAL));
    assert_eq!(t.balances(), (TOTAL, 0, 0));
    assert_eq!(t.client.get_schedule(&t.beneficiary), None);
}

#[test]
fn test_revoke_mid_vesting_keeps_vested_part_claimable() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + CLIFF); // 25% claimed
    t.client.claim_tokens(&t.beneficiary);
    t.at(START + 3_000); // 75% vested, 50% of it unclaimed
    assert_eq!(
        t.client.revoke_schedule(&t.beneficiary),
        (50_000_000, 25_000_000)
    );
    assert_eq!(t.balances(), (25_000_000, 50_000_000, 25_000_000));

    let schedule = t.client.get_schedule(&t.beneficiary).unwrap();
    assert!(schedule.revoked);
    assert_eq!(schedule.total_amount, 75_000_000);

    // Nothing more vests after the revoke, however long the beneficiary waits.
    t.at(START + 100 * DURATION);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), 75_000_000);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), 50_000_000);
    assert_eq!(t.balances(), (25_000_000, 0, 75_000_000));
    assert_eq!(
        t.client.try_claim_tokens(&t.beneficiary),
        Err(Ok(err(VestingError::NothingToClaim)))
    );
}

#[test]
fn test_revoke_after_full_vest_refunds_nothing() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION / 2);
    t.client.claim_tokens(&t.beneficiary);
    t.at(START + DURATION);
    assert_eq!(t.client.revoke_schedule(&t.beneficiary), (TOTAL / 2, 0));
    assert_eq!(t.balances(), (0, TOTAL / 2, TOTAL / 2));
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL / 2);
    assert_eq!(t.balances(), (0, 0, TOTAL));
}

#[test]
fn test_revoke_after_fully_claimed_just_removes_the_schedule() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION);
    t.client.claim_tokens(&t.beneficiary);
    assert_eq!(t.client.revoke_schedule(&t.beneficiary), (0, 0));
    assert_eq!(t.client.get_schedule(&t.beneficiary), None);
    assert_eq!(t.balances(), (0, 0, TOTAL));
}

#[test]
fn test_revoke_twice_fails() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION / 2);
    t.client.revoke_schedule(&t.beneficiary);
    assert_eq!(
        t.client.try_revoke_schedule(&t.beneficiary),
        Err(Ok(err(VestingError::AlreadyRevoked)))
    );
}

/// A beneficiary who cannot receive tokens cannot block a revoke, because
/// revoke never sends them anything.
#[test]
fn test_beneficiary_that_cannot_receive_does_not_block_revoke() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.beneficiary);
    t.at(START + DURATION / 2);

    assert_eq!(
        t.client.revoke_schedule(&t.beneficiary),
        (TOTAL / 2, TOTAL / 2)
    );
    assert_eq!(t.balances(), (TOTAL / 2, TOTAL / 2, 0));

    assert!(t.client.try_claim_tokens(&t.beneficiary).is_err());
    t.sac.set_authorized(&t.beneficiary, &true);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL / 2);
}

/// A funder who cannot receive tokens (here deauthorized; on a classic asset,
/// also a removed trustline) cannot block a revoke either: the refund is kept
/// for them to withdraw later.
#[test]
fn test_refund_is_deferred_when_funder_cannot_receive() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.funder);
    t.at(START + DURATION / 4 + CLIFF / 2); // 37.5% vested

    let (claimable, refund) = t.client.revoke_schedule(&t.beneficiary);
    assert_eq!((claimable, refund), (37_500_000, 62_500_000));
    assert_eq!(
        t.last_event(),
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("revoked"), t.beneficiary.clone()).into_val(&t.env),
                (claimable, refund).into_val(&t.env),
            )
        ]
    );
    assert_eq!(t.balances(), (0, TOTAL, 0), "nothing left the contract");
    assert_eq!(t.client.get_refund(&t.funder), refund);

    assert!(t.client.try_withdraw_refund(&t.funder).is_err());
    t.sac.set_authorized(&t.funder, &true);
    assert_eq!(t.client.withdraw_refund(&t.funder), refund);
    assert_eq!(
        t.last_event(),
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("refunded"), t.funder.clone()).into_val(&t.env),
                refund.into_val(&t.env),
            )
        ]
    );
    assert_eq!(t.client.get_refund(&t.funder), 0);
    assert_eq!(
        t.client.try_withdraw_refund(&t.funder),
        Err(Ok(err(VestingError::NothingToWithdraw)))
    );

    assert_eq!(t.client.claim_tokens(&t.beneficiary), claimable);
    assert_eq!(t.balances(), (refund, 0, claimable));
}

#[test]
fn test_deferred_refund_emits_refund_due() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.funder);
    t.client.revoke_schedule(&t.beneficiary);
    let due: soroban_sdk::Vec<(
        Address,
        soroban_sdk::Vec<soroban_sdk::Val>,
        soroban_sdk::Val,
    )> = t
        .env
        .events()
        .all()
        .iter()
        .filter(|e| e.0 == t.id)
        .filter(|e| {
            let topic: Symbol = e.1.get(0).unwrap().into_val(&t.env);
            topic == symbol_short!("refunddue")
        })
        .fold(vec![&t.env], |mut acc, e| {
            acc.push_back(e);
            acc
        });
    assert_eq!(
        due,
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("refunddue"), t.funder.clone()).into_val(&t.env),
                TOTAL.into_val(&t.env),
            )
        ]
    );
}

#[test]
fn test_withdraw_refund_requires_funder_auth() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.funder);
    t.client.revoke_schedule(&t.beneficiary);
    t.sac.set_authorized(&t.funder, &true);

    t.env.set_auths(&[]);
    assert!(t.client.try_withdraw_refund(&t.funder).is_err());
    let attacker = Address::generate(&t.env);
    t.mock_single(
        &attacker,
        "withdraw_refund",
        (t.funder.clone(),).into_val(&t.env),
    );
    assert!(t.client.try_withdraw_refund(&t.funder).is_err());
    assert_eq!(t.client.get_refund(&t.funder), TOTAL);
}

#[test]
fn test_revoke_requires_admin_auth() {
    let t = Setup::new(TOTAL);
    t.create_default();

    t.env.set_auths(&[]);
    assert!(t.client.try_revoke_schedule(&t.beneficiary).is_err());

    // The funder is not the admin.
    t.mock_single(
        &t.funder,
        "revoke_schedule",
        (t.beneficiary.clone(),).into_val(&t.env),
    );
    assert!(t.client.try_revoke_schedule(&t.beneficiary).is_err());
    assert_eq!(t.balances(), (0, TOTAL, 0));

    t.mock_single(
        &t.admin,
        "revoke_schedule",
        (t.beneficiary.clone(),).into_val(&t.env),
    );
    assert_eq!(t.client.revoke_schedule(&t.beneficiary), (0, TOTAL));
}

#[test]
fn test_revoke_unknown_schedule_fails() {
    let t = Setup::new(TOTAL);
    assert_eq!(
        t.client.try_revoke_schedule(&t.beneficiary),
        Err(Ok(err(VestingError::ScheduleNotFound)))
    );
}

// ===========================================================================
// Storage and TTL
// ===========================================================================

#[test]
fn test_schedule_is_a_persistent_entry_with_ttl() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.env.as_contract(&t.id, || {
        let key = DataKey::Schedule(t.beneficiary.clone());
        assert!(t.env.storage().persistent().has(&key));
        assert_eq!(
            t.env.storage().persistent().get_ttl(&key),
            PERSISTENT_TTL_EXTEND
        );
        assert!(!t.env.storage().instance().has(&key));
        assert_eq!(t.env.storage().instance().get_ttl(), INSTANCE_TTL_EXTEND);
    });
}

#[test]
fn test_schedule_ttl_is_extended_only_past_the_threshold() {
    let t = Setup::new(TOTAL);
    t.create_default();
    let key = DataKey::Schedule(t.beneficiary.clone());
    let ttl = || {
        t.env
            .as_contract(&t.id, || t.env.storage().persistent().get_ttl(&key))
    };

    let just_before = 100 + (PERSISTENT_TTL_EXTEND - PERSISTENT_TTL_THRESHOLD - 1);
    t.env.ledger().with_mut(|l| l.sequence_number = just_before);
    t.client.get_schedule(&t.beneficiary);
    assert_eq!(ttl(), PERSISTENT_TTL_THRESHOLD + 1, "not extended yet");

    t.env
        .ledger()
        .with_mut(|l| l.sequence_number = just_before + 1);
    t.client.get_vested_amount(&t.beneficiary);
    assert_eq!(ttl(), PERSISTENT_TTL_EXTEND, "extended at the threshold");
}

#[test]
fn test_claim_and_reads_keep_a_dormant_schedule_alive() {
    let t = Setup::new(TOTAL);
    t.create_default();
    let key = DataKey::Schedule(t.beneficiary.clone());

    // Walk to the last ledger before expiry without touching the vesting
    // contract. Reading the token's balance keeps the token's own entries
    // alive, as normal network traffic would.
    t.advance_keeping_token_alive(100 + PERSISTENT_TTL_EXTEND - 1);
    t.at(START + DURATION / 2);
    t.client.claim_tokens(&t.beneficiary);
    let after_claim = t
        .env
        .as_contract(&t.id, || t.env.storage().persistent().get_ttl(&key));
    assert_eq!(after_claim, PERSISTENT_TTL_EXTEND);

    let target = t.env.ledger().sequence() + PERSISTENT_TTL_EXTEND - 1;
    t.advance_keeping_token_alive(target);
    t.client.get_claimed_amount(&t.beneficiary);
    let after_read = t
        .env
        .as_contract(&t.id, || t.env.storage().persistent().get_ttl(&key));
    assert_eq!(after_read, PERSISTENT_TTL_EXTEND);
}

#[test]
fn test_schedules_do_not_share_ttl() {
    let t = Setup::new(2 * TOTAL);
    let other = Address::generate(&t.env);
    t.create_default();
    t.client
        .create_schedule(&t.funder, &other, &TOTAL, &START, &CLIFF, &DURATION);

    let advance = PERSISTENT_TTL_EXTEND - PERSISTENT_TTL_THRESHOLD;
    t.env
        .ledger()
        .with_mut(|l| l.sequence_number = 100 + advance);
    t.client.get_schedule(&t.beneficiary);

    let (mine, theirs) = t.env.as_contract(&t.id, || {
        (
            t.env
                .storage()
                .persistent()
                .get_ttl(&DataKey::Schedule(t.beneficiary.clone())),
            t.env
                .storage()
                .persistent()
                .get_ttl(&DataKey::Schedule(other.clone())),
        )
    });
    assert_eq!(mine, PERSISTENT_TTL_EXTEND);
    assert_eq!(theirs, PERSISTENT_TTL_EXTEND - advance);
}

// ===========================================================================
// Events
// ===========================================================================

#[test]
fn test_events() {
    let t = Setup::new(TOTAL);

    t.create_default();
    assert_eq!(
        t.last_event(),
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("created"), t.beneficiary.clone()).into_val(&t.env),
                (t.funder.clone(), TOTAL, START, CLIFF, DURATION).into_val(&t.env),
            )
        ]
    );

    t.at(START + DURATION / 2);
    t.client.claim_tokens(&t.beneficiary);
    assert_eq!(
        t.last_event(),
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("claimed"), t.beneficiary.clone()).into_val(&t.env),
                (TOTAL / 2).into_val(&t.env),
            )
        ]
    );

    t.at(START + 3_000);
    t.client.revoke_schedule(&t.beneficiary);
    assert_eq!(
        t.last_event(),
        vec![
            &t.env,
            (
                t.id.clone(),
                (symbol_short!("revoked"), t.beneficiary.clone()).into_val(&t.env),
                (TOTAL / 4, TOTAL / 4).into_val(&t.env),
            )
        ]
    );
}

#[test]
fn test_initialize_event() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, VestingContract);
    let client = VestingContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let token = Address::generate(&env);
    client.initialize(&admin, &token);
    assert_eq!(
        env.events().all(),
        vec![
            &env,
            (
                id.clone(),
                (symbol_short!("init"),).into_val(&env),
                (admin, token).into_val(&env),
            )
        ]
    );
}

fn instance_ttl(t: &Setup) -> u32 {
    t.env
        .as_contract(&t.id, || t.env.storage().instance().get_ttl())
}

fn schedule_ttl(t: &Setup, beneficiary: &Address) -> u32 {
    t.env.as_contract(&t.id, || {
        t.env
            .storage()
            .persistent()
            .get_ttl(&DataKey::Schedule(beneficiary.clone()))
    })
}

/// A schedule created while the instance still has more than the threshold
/// left must not outlive the instance.
#[test]
fn test_create_extends_instance_to_cover_the_new_schedule() {
    let t = Setup::new(TOTAL);
    // Instance was extended to the full window by `initialize` at ledger 100.
    // Keep the funder's token balance alive while time passes.
    while t.env.ledger().sequence() < 100 + 1_000_000 {
        t.env.ledger().with_mut(|l| l.sequence_number += 100_000);
        t.token.balance(&t.funder);
    }
    assert!(instance_ttl(&t) > INSTANCE_TTL_THRESHOLD);

    t.create_default();
    assert_eq!(schedule_ttl(&t, &t.beneficiary), PERSISTENT_TTL_EXTEND);
    assert!(instance_ttl(&t) >= schedule_ttl(&t, &t.beneficiary));
}

/// Same guarantee when an existing schedule is extended later by a claim or
/// a read, after another schedule already refreshed the instance.
#[test]
fn test_touching_a_schedule_keeps_instance_ttl_at_least_as_long() {
    let t = Setup::new(2 * TOTAL);
    let other = Address::generate(&t.env);
    t.create_default();
    t.client
        .create_schedule(&t.funder, &other, &TOTAL, &START, &CLIFF, &DURATION);

    // Both schedules reach the threshold; only `other` is touched, which
    // also refreshes the instance.
    t.advance_keeping_token_alive(100 + PERSISTENT_TTL_EXTEND - PERSISTENT_TTL_THRESHOLD);
    t.client.get_schedule(&other);

    // A little later the first schedule is touched and extended.
    t.advance_keeping_token_alive(t.env.ledger().sequence() + 1_000);
    t.client.get_vested_amount(&t.beneficiary);
    assert_eq!(schedule_ttl(&t, &t.beneficiary), PERSISTENT_TTL_EXTEND);
    assert!(instance_ttl(&t) >= schedule_ttl(&t, &t.beneficiary));
}

// ===========================================================================
// Audit probes
// ===========================================================================

/// The contract must not be usable as a funder: its own balance is the
/// escrow of every other schedule.
#[test]
fn test_contract_cannot_fund_a_schedule_from_its_own_escrow() {
    let t = Setup::new(TOTAL);
    t.create_default(); // contract now holds TOTAL of someone else's escrow
    let thief = Address::generate(&t.env);

    t.env.set_auths(&[]);
    let r = t
        .client
        .try_create_schedule(&t.id, &thief, &TOTAL, &0, &0, &1);
    std::println!("[probe] create with funder = contract, no auth -> {:?}", r);
    assert!(r.is_err());
    assert_eq!(t.balances(), (0, TOTAL, 0));
}

#[test]
fn test_error_codes_are_stable() {
    let codes = [
        (VestingError::AlreadyInitialized, 1),
        (VestingError::NotInitialized, 2),
        (VestingError::InvalidAmount, 3),
        (VestingError::InvalidDuration, 4),
        (VestingError::CliffExceedsDuration, 5),
        (VestingError::TimeOverflow, 6),
        (VestingError::ScheduleExists, 7),
        (VestingError::ScheduleNotFound, 8),
        (VestingError::CliffNotReached, 9),
        (VestingError::NothingToClaim, 10),
        (VestingError::MathOverflow, 11),
        (VestingError::InvalidBeneficiary, 12),
        (VestingError::AlreadyRevoked, 13),
        (VestingError::NothingToWithdraw, 14),
    ];
    for (e, code) in codes {
        assert_eq!(e as u32, code);
        assert_eq!(err(e), soroban_sdk::Error::from_contract_error(code));
    }
}

#[test]
fn test_calls_before_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, VestingContract);
    let client = VestingContractClient::new(&env, &id);
    let someone = Address::generate(&env);
    let not_init = err(VestingError::NotInitialized);
    assert_eq!(client.try_claim_tokens(&someone), Err(Ok(not_init)));
    assert_eq!(client.try_revoke_schedule(&someone), Err(Ok(not_init)));
    assert_eq!(client.try_withdraw_refund(&someone), Err(Ok(not_init)));
    assert_eq!(client.try_get_token(), Err(Ok(not_init)));
    assert_eq!(client.get_schedule(&someone), None);
    assert_eq!(client.get_claimed_amount(&someone), 0);
    assert_eq!(client.get_refund(&someone), 0);
}

#[test]
fn test_end_boundaries() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION - 1);
    assert_eq!(
        t.client.get_vested_amount(&t.beneficiary),
        TOTAL * (DURATION as i128 - 1) / DURATION as i128
    );
    t.at(START + DURATION);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), TOTAL);
    t.at(u64::MAX);
    assert_eq!(t.client.get_vested_amount(&t.beneficiary), TOTAL);
    assert_eq!(t.client.claim_tokens(&t.beneficiary), TOTAL);
}

#[test]
fn test_start_boundary_with_backdated_cliff() {
    let t = Setup::new(TOTAL);
    // start = 0 (genesis), cliff already passed, now = 500.
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &TOTAL, &0, &100, &DURATION);
    assert_eq!(
        t.client.get_vested_amount(&t.beneficiary),
        TOTAL * 500 / DURATION as i128
    );
}

#[test]
fn test_revoke_rounding_conserves_every_unit() {
    let total: i128 = 1_000_003;
    let duration: u64 = 7;
    let t = Setup::new(total);
    t.client
        .create_schedule(&t.funder, &t.beneficiary, &total, &START, &0, &duration);
    t.at(START + 2);
    let first = t.client.claim_tokens(&t.beneficiary); // floor(2/7)
    t.at(START + 3);
    let (claimable, refund) = t.client.revoke_schedule(&t.beneficiary);
    // Beneficiary keeps floor(total * 3 / 7), funder gets the remainder.
    assert_eq!(first + claimable, total * 3 / 7);
    assert_eq!(first + claimable + refund, total);
    t.client.claim_tokens(&t.beneficiary);
    assert_eq!(t.balances(), (refund, 0, total * 3 / 7));
}

#[test]
fn test_revoke_auth_tree_is_admin_only() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.at(START + DURATION / 2);
    t.client.revoke_schedule(&t.beneficiary);
    assert_eq!(
        t.env.auths(),
        std::vec![(
            t.admin.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.id.clone(),
                    Symbol::new(&t.env, "revoke_schedule"),
                    (t.beneficiary.clone(),).into_val(&t.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn test_refunds_accumulate_and_withdraw_once() {
    let t = Setup::new(3 * TOTAL);
    let b2 = Address::generate(&t.env);
    let b3 = Address::generate(&t.env);
    t.create_default();
    t.client
        .create_schedule(&t.funder, &b2, &TOTAL, &START, &CLIFF, &DURATION);
    t.client
        .create_schedule(&t.funder, &b3, &TOTAL, &START, &CLIFF, &DURATION);
    t.deauthorize(&t.funder);

    t.client.revoke_schedule(&t.beneficiary); // before cliff: TOTAL refund
    t.at(START + DURATION / 2);
    t.client.revoke_schedule(&b2); // TOTAL / 2 refund
    assert_eq!(t.client.get_refund(&t.funder), TOTAL + TOTAL / 2);

    // Funder becomes able to receive again: the next refund is sent directly
    // and does not touch the deferred amount.
    t.sac.set_authorized(&t.funder, &true);
    t.client.revoke_schedule(&b3);
    assert_eq!(t.token.balance(&t.funder), TOTAL / 2);
    assert_eq!(t.client.get_refund(&t.funder), TOTAL + TOTAL / 2);

    assert_eq!(t.client.withdraw_refund(&t.funder), TOTAL + TOTAL / 2);
    assert_eq!(t.token.balance(&t.funder), 2 * TOTAL);
    assert_eq!(
        t.client.try_withdraw_refund(&t.funder),
        Err(Ok(err(VestingError::NothingToWithdraw)))
    );
    // What is left in the contract is exactly what b2 and b3 can still claim.
    assert_eq!(t.token.balance(&t.id), TOTAL);
}

#[test]
fn test_withdraw_refund_auth_tree_is_funder_only() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.funder);
    t.client.revoke_schedule(&t.beneficiary);
    t.sac.set_authorized(&t.funder, &true);
    t.client.withdraw_refund(&t.funder);
    assert_eq!(
        t.env.auths(),
        std::vec![(
            t.funder.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    t.id.clone(),
                    Symbol::new(&t.env, "withdraw_refund"),
                    (t.funder.clone(),).into_val(&t.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn test_refund_entry_ttl_is_covered_by_instance() {
    let t = Setup::new(TOTAL);
    t.create_default();
    t.deauthorize(&t.funder);
    t.client.revoke_schedule(&t.beneficiary);
    let (refund_ttl, inst) = t.env.as_contract(&t.id, || {
        (
            t.env
                .storage()
                .persistent()
                .get_ttl(&DataKey::Refund(t.funder.clone())),
            t.env.storage().instance().get_ttl(),
        )
    });
    assert_eq!(refund_ttl, PERSISTENT_TTL_EXTEND);
    assert!(inst >= refund_ttl);
}

/// Token balance held by the contract always equals what beneficiaries can
/// still claim plus deferred refunds, through a mix of every operation.
#[test]
fn test_escrow_balance_matches_obligations_throughout() {
    let t = Setup::new(20 * TOTAL);
    let funder2 = Address::generate(&t.env);
    t.sac.mint(&funder2, &(10 * TOTAL));
    let bens: std::vec::Vec<Address> = (0..4).map(|_| Address::generate(&t.env)).collect();
    let funders = [&t.funder, &funder2, &t.funder, &funder2];

    let check = |label: &str| {
        let mut owed: i128 = 0;
        for b in &bens {
            if let Some(s) = t.client.get_schedule(b) {
                owed += s.total_amount - s.claimed;
            }
        }
        owed += t.client.get_refund(&t.funder) + t.client.get_refund(&funder2);
        assert_eq!(t.token.balance(&t.id), owed, "after {label}");
    };

    let params = [
        (1_000_003i128, 0u64, 0u64, 7u64),
        (TOTAL, START, CLIFF, DURATION),
        (999_999_937, START + 500, 0, 3_333),
        (TOTAL, 0, 2_000, 2_000),
    ];
    for (i, (amount, start, cliff, duration)) in params.iter().enumerate() {
        t.client
            .create_schedule(funders[i], &bens[i], amount, start, cliff, duration);
        check("create");
    }
    t.deauthorize(&funder2);

    let steps: [(u64, u8, usize); 10] = [
        (600, 0, 0),
        (1_500, 0, 1),
        (1_700, 1, 2),
        (2_100, 0, 3),
        (2_500, 1, 1),
        (2_600, 0, 2),
        (3_000, 0, 1),
        (4_000, 1, 3),
        (9_000, 0, 1),
        (9_000, 0, 3),
    ];
    for (ts, op, who) in steps {
        t.at(ts);
        if op == 0 {
            let _ = t.client.try_claim_tokens(&bens[who]);
            check("claim");
        } else {
            let _ = t.client.try_revoke_schedule(&bens[who]);
            check("revoke");
        }
    }
    t.sac.set_authorized(&funder2, &true);
    let _ = t.client.try_withdraw_refund(&funder2);
    check("withdraw");
}

mod mock_token {
    use super::VestingContractClient;
    use soroban_sdk::{contract, contractimpl, symbol_short, Address, Env, Symbol};

    const MODE: Symbol = symbol_short!("MODE");
    const VEST: Symbol = symbol_short!("VEST");
    const SEEN: Symbol = symbol_short!("SEEN");

    /// Minimal token for failure-path tests. Mode 0: transfers succeed and
    /// move nothing. Mode 1: transfers panic. Mode 2: transfers try to call
    /// back into the vesting contract and record whether that worked.
    #[contract]
    pub struct MockToken;

    #[contractimpl]
    impl MockToken {
        pub fn set_mode(env: Env, mode: u32, vesting: Address) {
            env.storage().instance().set(&MODE, &mode);
            env.storage().instance().set(&VEST, &vesting);
        }

        pub fn reentry_succeeded(env: Env) -> Option<bool> {
            env.storage().instance().get(&SEEN)
        }

        pub fn transfer(env: Env, from: Address, _to: Address, _amount: i128) {
            let mode: u32 = env.storage().instance().get(&MODE).unwrap_or(0);
            if mode == 1 {
                panic!("token refuses transfers");
            }
            if mode == 2 {
                let vesting: Address = env.storage().instance().get(&VEST).unwrap();
                let ok = VestingContractClient::new(&env, &vesting)
                    .try_get_claimed_amount(&from)
                    .is_ok();
                env.storage().instance().set(&SEEN, &ok);
            }
        }
    }
}

fn setup_with_mock_token() -> (
    Env,
    VestingContractClient<'static>,
    mock_token::MockTokenClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 500);
    let token_id = env.register_contract(None, mock_token::MockToken);
    let token = mock_token::MockTokenClient::new(&env, &token_id);
    let id = env.register_contract(None, VestingContract);
    let client = VestingContractClient::new(&env, &id);
    client.initialize(&Address::generate(&env), &token_id);
    token.set_mode(&0, &id);
    (env, client, token)
}

/// Soroban rejects re-entry, so a token cannot call back into vesting in the
/// middle of a transfer. State is written before transfers anyway.
#[test]
fn test_token_cannot_reenter_the_contract() {
    let (env, client, token) = setup_with_mock_token();
    let funder = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    token.set_mode(&2, &client.address);
    client.create_schedule(&funder, &beneficiary, &TOTAL, &START, &0, &DURATION);
    assert_eq!(token.reentry_succeeded(), Some(false));
}

/// A refund to a token that panics (not just a SAC error) is deferred too.
#[test]
fn test_panicking_token_transfer_defers_refund() {
    let (env, client, token) = setup_with_mock_token();
    let funder = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    client.create_schedule(&funder, &beneficiary, &TOTAL, &START, &0, &DURATION);

    token.set_mode(&1, &client.address);
    env.ledger()
        .with_mut(|l| l.timestamp = START + DURATION / 4);
    assert_eq!(
        client.revoke_schedule(&beneficiary),
        (TOTAL / 4, TOTAL * 3 / 4)
    );
    assert_eq!(client.get_refund(&funder), TOTAL * 3 / 4);
    // Claims and withdrawals do revert while the token keeps failing.
    assert!(client.try_claim_tokens(&beneficiary).is_err());
    assert!(client.try_withdraw_refund(&funder).is_err());
    assert_eq!(client.get_refund(&funder), TOTAL * 3 / 4);
    assert_eq!(client.get_schedule(&beneficiary).unwrap().claimed, 0);

    token.set_mode(&0, &client.address);
    assert_eq!(client.withdraw_refund(&funder), TOTAL * 3 / 4);
    assert_eq!(client.claim_tokens(&beneficiary), TOTAL / 4);
}

/// Worst-case calls stay far below mainnet per-transaction limits
/// (400M instructions, 41.9 MB memory as of Nov 2026). The contract runs
/// natively here, which understates cost; the same calls on the wasm built
/// with Rust 1.81 measured about 3.5M instructions and 1.9 MB each.
#[test]
fn test_resource_usage_of_each_call() {
    let t = Setup::new(TOTAL);
    let measure = |label: &str, f: &dyn Fn()| {
        t.env.budget().reset_default();
        f();
        let (cpu, mem) = (
            t.env.budget().cpu_instruction_cost(),
            t.env.budget().memory_bytes_cost(),
        );
        std::println!("[budget] {label:<26} cpu {cpu:>10}  mem {mem:>9}");
        assert!(cpu < 40_000_000, "{label}: {cpu} instructions");
        assert!(mem < 10_000_000, "{label}: {mem} bytes");
    };
    measure("create_schedule", &|| t.create_default());
    t.at(START + DURATION / 2);
    measure("claim_tokens", &|| {
        t.client.claim_tokens(&t.beneficiary);
    });
    t.deauthorize(&t.funder);
    t.at(START + 3_000);
    measure("revoke (deferred refund)", &|| {
        t.client.revoke_schedule(&t.beneficiary);
    });
    t.sac.set_authorized(&t.funder, &true);
    measure("withdraw_refund", &|| {
        t.client.withdraw_refund(&t.funder);
    });
    measure("get_vested_amount", &|| {
        t.client.get_vested_amount(&t.beneficiary);
    });
}

fn entry_bytes(env: &Env, key: &soroban_sdk::xdr::LedgerKey) -> usize {
    use soroban_sdk::xdr::{Limits, WriteXdr};
    let snap = env.to_snapshot();
    for (k, (e, _)) in snap.ledger.ledger_entries.iter() {
        if k.as_ref() == key {
            return e.to_xdr(Limits::none()).unwrap().len();
        }
    }
    panic!("entry not found");
}

/// The original contract kept every schedule in one instance Map, which grew
/// ~236 bytes per schedule until writes hit the 64 KiB entry limit. Now the
/// instance and each schedule entry stay the same size however many exist.
#[test]
fn test_storage_does_not_grow_with_schedule_count() {
    use soroban_sdk::xdr::{
        ContractDataDurability, LedgerKey, LedgerKeyContractData, ScAddress, ScVal,
    };
    let t = Setup::new(1_000 * TOTAL);
    t.env.budget().reset_unlimited();
    let contract = ScAddress::from(&t.id);
    let instance_key = LedgerKey::ContractData(LedgerKeyContractData {
        contract: contract.clone(),
        key: ScVal::LedgerKeyContractInstance,
        durability: ContractDataDurability::Persistent,
    });
    let schedule_key = |b: &Address| {
        let key: soroban_sdk::Val = DataKey::Schedule(b.clone()).into_val(&t.env);
        LedgerKey::ContractData(LedgerKeyContractData {
            contract: contract.clone(),
            key: soroban_sdk::TryFromVal::try_from_val(&t.env, &key).unwrap(),
            durability: ContractDataDurability::Persistent,
        })
    };

    t.create_default();
    let instance_one = entry_bytes(&t.env, &instance_key);
    let schedule_one = entry_bytes(&t.env, &schedule_key(&t.beneficiary));
    let mut last = t.beneficiary.clone();
    for _ in 0..20 {
        last = Address::generate(&t.env);
        t.client
            .create_schedule(&t.funder, &last, &TOTAL, &START, &CLIFF, &DURATION);
    }
    let instance_many = entry_bytes(&t.env, &instance_key);
    let schedule_many = entry_bytes(&t.env, &schedule_key(&last));
    std::println!(
        "[storage] instance {instance_one} -> {instance_many} bytes, schedule {schedule_one} -> {schedule_many} bytes after 21 schedules"
    );
    assert_eq!(instance_one, instance_many);
    assert_eq!(schedule_one, schedule_many);
    assert!(schedule_one < 1_024);
}
