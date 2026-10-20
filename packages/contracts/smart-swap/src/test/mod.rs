//! Tests for Smart Swap Contract

mod auth;
mod conditions;
mod config;
mod mocks;
mod swap;
mod ttl;
mod validation;

use crate::{SmartSwapContract, SmartSwapContractClient, SwapConditionType, PRICE_SCALE};
use mocks::{MockOracle, MockOracleClient, MockRouter, MockRouterClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, Symbol,
};

pub const NOW: u64 = 10_000;
pub const MAX_PRICE_AGE: u64 = 300;
pub const TOLERANCE_BPS: u32 = 50;
pub const OWNER_FUNDS: i128 = 10_000_000;
pub const ROUTER_FUNDS: i128 = 1_000_000_000;
pub const AMOUNT: i128 = 1_000_000;
const HELPER_TTL: u32 = 1_000_000;

pub fn xlm() -> Symbol {
    symbol_short!("XLM")
}

pub fn usdc() -> Symbol {
    symbol_short!("USDC")
}

pub struct Setup<'a> {
    pub env: Env,
    pub admin: Address,
    pub owner: Address,
    pub swap_id: Address,
    pub swap: SmartSwapContractClient<'a>,
    pub oracle_id: Address,
    pub oracle: MockOracleClient<'a>,
    pub router_id: Address,
    pub router: MockRouterClient<'a>,
    pub source: TokenClient<'a>,
    pub destination: TokenClient<'a>,
}

impl<'a> Setup<'a> {
    /// Everything registered, funded and initialized.
    pub fn new() -> Self {
        let setup = Self::uninitialized();
        setup.swap.initialize(
            &setup.admin,
            &setup.oracle_id,
            &setup.router_id,
            &MAX_PRICE_AGE,
            &TOLERANCE_BPS,
        );
        setup
    }

    pub fn uninitialized() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        // Helper contracts and balances outlive every ledger the TTL tests
        // jump to. The swap contract is registered with the default TTL.
        let default_min_ttl = env.ledger().get().min_persistent_entry_ttl;
        env.ledger().with_mut(|li| {
            li.timestamp = NOW;
            li.sequence_number = 100;
            li.min_persistent_entry_ttl = HELPER_TTL;
        });

        let admin = Address::generate(&env);
        let owner = Address::generate(&env);

        let oracle_id = env.register_contract(None, MockOracle);
        let oracle = MockOracleClient::new(&env, &oracle_id);
        let router_id = env.register_contract(None, MockRouter);
        let router = MockRouterClient::new(&env, &router_id);

        let issuer = Address::generate(&env);
        let source_sac = env.register_stellar_asset_contract_v2(issuer.clone());
        let destination_sac = env.register_stellar_asset_contract_v2(issuer);
        StellarAssetClient::new(&env, &source_sac.address()).mint(&owner, &OWNER_FUNDS);
        StellarAssetClient::new(&env, &destination_sac.address()).mint(&router_id, &ROUTER_FUNDS);
        let source = TokenClient::new(&env, &source_sac.address());
        let destination = TokenClient::new(&env, &destination_sac.address());

        env.ledger()
            .with_mut(|li| li.min_persistent_entry_ttl = default_min_ttl);
        let swap_id = env.register_contract(None, SmartSwapContract);
        let swap = SmartSwapContractClient::new(&env, &swap_id);

        let setup = Setup {
            env,
            admin,
            owner,
            swap_id,
            swap,
            oracle_id,
            oracle,
            router_id,
            router,
            source,
            destination,
        };
        setup.set_market(PRICE_SCALE);
        setup
    }

    /// Fresh oracle price for XLM/USDC, with the router filling at that price.
    pub fn set_market(&self, price: i128) {
        self.set_oracle_price(price, self.env.ledger().timestamp());
        self.router.set_rate(&price);
    }

    pub fn set_oracle_price(&self, price: i128, timestamp: u64) {
        self.oracle.set_price(&xlm(), &usdc(), &price, &timestamp);
    }

    pub fn create(&self, condition_type: SwapConditionType) -> u64 {
        self.create_with(condition_type, 0, 0)
    }

    pub fn create_with(
        &self,
        condition_type: SwapConditionType,
        min_amount_out: i128,
        max_slippage: u32,
    ) -> u64 {
        self.env.mock_all_auths();
        let id = self.swap.create_swap_condition(
            &self.owner,
            &xlm(),
            &usdc(),
            &self.source.address,
            &self.destination.address,
            &condition_type,
            &AMOUNT,
            &min_amount_out,
            &max_slippage,
            &(NOW + 86_400),
        );
        self.enforce_auths();
        id
    }

    /// From here on every `require_auth` is checked for real and no
    /// signatures are supplied, as for a keeper transaction. Contract
    /// auth (direct invoker, `authorize_as_current_contract`) still works.
    pub fn enforce_auths(&self) {
        self.env.set_auths(&[]);
    }

    /// Cancel signed by the owner.
    pub fn cancel(&self, id: u64) {
        self.env.mock_all_auths();
        self.swap.cancel_condition(&id, &self.owner);
        self.enforce_auths();
    }
}

/// What a test-side `try_` call returns when a `require_auth` fails: the
/// host raises `Error(Auth, InvalidAction)` inside the contract and reports
/// it to the caller as `Error(Context, InvalidAction)`. Contract errors
/// surface as `Error(Contract, n)` instead.
pub fn auth_error() -> soroban_sdk::Error {
    soroban_sdk::Error::from_type_and_code(
        soroban_sdk::xdr::ScErrorType::Context,
        soroban_sdk::xdr::ScErrorCode::InvalidAction,
    )
}
