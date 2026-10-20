//! Client for a Soroswap-compatible router.
//!
//! Signatures match the Soroswap router. `swap_exact_tokens_for_tokens`
//! calls `to.require_auth()` and then, from inside the router, transfers
//! `amount_in` of `path[0]` from `to` to the pair returned by
//! `router_pair_for(path[0], path[1])`. The output is sent to `to`.

use soroban_sdk::{contractclient, Address, Env, Vec};

#[allow(dead_code)]
#[contractclient(name = "RouterClient")]
pub trait Router {
    fn router_pair_for(env: Env, token_a: Address, token_b: Address) -> Address;

    fn swap_exact_tokens_for_tokens(
        env: Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128>;
}
