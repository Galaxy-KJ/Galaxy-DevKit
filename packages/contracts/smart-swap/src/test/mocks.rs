//! Test doubles for the oracle and the Soroswap router.

use crate::oracle::{PriceEntry, PriceResult};
use crate::PRICE_SCALE;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, symbol_short, token,
    vec, Address, Env, Symbol, Vec,
};

/// Same `get_price_checked` ABI as `price-oracle` and `galaxy-oracle`.
#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set_price(env: Env, base: Symbol, quote: Symbol, price: i128, timestamp: u64) {
        env.storage()
            .instance()
            .set(&(base, quote), &(price, timestamp));
    }

    /// Simulates a buggy oracle that never flags a price as stale.
    pub fn set_never_stale(env: Env, never_stale: bool) {
        env.storage()
            .instance()
            .set(&symbol_short!("NOSTALE"), &never_stale);
    }

    pub fn get_price_checked(
        env: Env,
        base: Symbol,
        quote: Symbol,
        max_age_seconds: u64,
    ) -> PriceResult {
        let (price, timestamp): (i128, u64) = env
            .storage()
            .instance()
            .get(&(base, quote))
            .expect("price not found");
        let age = env.ledger().timestamp().saturating_sub(timestamp);
        let never_stale: bool = env
            .storage()
            .instance()
            .get(&symbol_short!("NOSTALE"))
            .unwrap_or(false);
        PriceResult {
            entry: PriceEntry {
                price,
                timestamp,
                pusher: env.current_contract_address(),
            },
            age_seconds: age,
            is_stale: !never_stale && age > max_age_seconds,
        }
    }
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum MockRouterError {
    InsufficientOutputAmount = 1,
    DeadlineExpired = 2,
}

#[contracttype]
#[derive(Clone)]
enum RouterKey {
    Rate,
    HonorMin,
    Skim,
}

/// Mirrors the parts of the Soroswap router that matter for custody:
/// `to.require_auth()`, then `transfer(to, pair, amount_in)` invoked by the
/// router (not by `to`), then the output is paid back to `to`. The pair is
/// the router itself, so it pays the output from its own balance.
#[contract]
pub struct MockRouter;

#[contractimpl]
impl MockRouter {
    /// Output per unit of input, scaled by `PRICE_SCALE`.
    pub fn set_rate(env: Env, rate: i128) {
        env.storage().instance().set(&RouterKey::Rate, &rate);
    }

    /// `false` makes the router skip its `amount_out_min` check and report
    /// a fake output, so the caller's own balance check is exercised.
    pub fn set_honor_min(env: Env, honor: bool) {
        env.storage().instance().set(&RouterKey::HonorMin, &honor);
    }

    /// Extra amount a malicious router tries to pull from `to`.
    pub fn set_skim(env: Env, skim: i128) {
        env.storage().instance().set(&RouterKey::Skim, &skim);
    }

    pub fn router_pair_for(env: Env, _token_a: Address, _token_b: Address) -> Address {
        env.current_contract_address()
    }

    pub fn swap_exact_tokens_for_tokens(
        env: Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128> {
        to.require_auth();
        if env.ledger().timestamp() >= deadline {
            panic_with_error!(&env, MockRouterError::DeadlineExpired);
        }

        let storage = env.storage().instance();
        let rate: i128 = storage.get(&RouterKey::Rate).unwrap_or(PRICE_SCALE);
        let honor_min: bool = storage.get(&RouterKey::HonorMin).unwrap_or(true);
        let skim: i128 = storage.get(&RouterKey::Skim).unwrap_or(0);
        let amount_out = amount_in * rate / PRICE_SCALE;
        if honor_min && amount_out < amount_out_min {
            panic_with_error!(&env, MockRouterError::InsufficientOutputAmount);
        }

        let token_in = path.get(0).unwrap();
        let token_out = path.get(path.len() - 1).unwrap();
        let pair = Self::router_pair_for(env.clone(), token_in.clone(), token_out.clone());
        token::Client::new(&env, &token_in).transfer(&to, &pair, &(amount_in + skim));
        token::Client::new(&env, &token_out).transfer(&pair, &to, &amount_out);

        let reported = if honor_min {
            amount_out
        } else {
            amount_out.max(amount_out_min)
        };
        vec![&env, amount_in, reported]
    }
}
