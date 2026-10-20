//! Smart Swap Contract for Galaxy DevKit
//!
//! This contract implements automated token swapping with price conditions
//! and slippage protection for the Stellar ecosystem. Prices come from the
//! configured oracle and swaps go through a Soroswap-compatible router.
//!
//! Source tokens are held by this contract from creation until the
//! condition is executed, cancelled or expires, so any keeper can execute a
//! condition without the owner's signature. The output always goes to the
//! stored `owner`.

#![no_std]

mod errors;
mod events;
mod oracle;
mod router;
mod types;

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, symbol_short, token, vec, Address, Env, IntoVal,
    Symbol, Vec,
};

pub use errors::SwapError;
pub use oracle::{OracleClient, PriceEntry, PriceResult};
pub use router::RouterClient;
pub use types::{Config, DataKey, SwapCondition, SwapConditionType, SwapExecution, SwapStatus};

/// Oracle prices carry six implied decimals, matching the TS client.
pub const PRICE_SCALE: i128 = 1_000_000;
pub const BPS_DENOMINATOR: i128 = 10_000;
/// Longest a condition may stay open: 365 days.
pub const MAX_CONDITION_DURATION_SECS: u64 = 365 * 24 * 60 * 60;
/// Router deadline, relative to the executing ledger's timestamp.
const SWAP_DEADLINE_SECS: u64 = 300;

/// Instance storage keys. Conditions and executions live under `DataKey`
/// in persistent storage.
const CONFIG: Symbol = symbol_short!("CONFIG");
const NEXT_CONDITION_ID: Symbol = symbol_short!("NEXT_ID");

// Swap conditions are meant to trigger within days, not months, so a
// week of slack matches how long a condition realistically stays open.
// Persistent entries use the same window and are extended on every read
// and write.
const INSTANCE_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const INSTANCE_TTL_EXTEND: u32 = 120_960; // ~7 days

/// Smart Swap Contract
#[contract]
pub struct SmartSwapContract;

/// Contract implementation
#[contractimpl]
impl SmartSwapContract {
    /// Initialize the contract. Callable once, signed by `admin`.
    pub fn initialize(
        env: &Env,
        admin: Address,
        oracle: Address,
        router: Address,
        max_price_age_secs: u64,
        target_tolerance_bps: u32,
    ) {
        let storage = env.storage().instance();
        if storage.has(&CONFIG) {
            panic_with_error!(env, SwapError::AlreadyInitialized);
        }
        admin.require_auth();
        Self::validate_config(env, max_price_age_secs, target_tolerance_bps);

        let config = Config {
            admin,
            oracle,
            router,
            max_price_age_secs,
            target_tolerance_bps,
        };
        storage.set(&CONFIG, &config);
        storage.set(&NEXT_CONDITION_ID, &1u64);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Replace the oracle, router and price parameters. Admin only.
    pub fn set_config(
        env: &Env,
        oracle: Address,
        router: Address,
        max_price_age_secs: u64,
        target_tolerance_bps: u32,
    ) {
        let mut config = Self::load_config(env);
        config.admin.require_auth();
        Self::validate_config(env, max_price_age_secs, target_tolerance_bps);

        config.oracle = oracle;
        config.router = router;
        config.max_price_age_secs = max_price_age_secs;
        config.target_tolerance_bps = target_tolerance_bps;
        let storage = env.storage().instance();
        storage.set(&CONFIG, &config);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn get_config(env: &Env) -> Config {
        let config = Self::load_config(env);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        config
    }

    /// Create a new swap condition. `reference_price` is the oracle price
    /// at creation.
    #[allow(clippy::too_many_arguments)]
    pub fn create_swap_condition(
        env: &Env,
        owner: Address,
        source_asset: Symbol,
        destination_asset: Symbol,
        source_token: Address,
        destination_token: Address,
        condition_type: SwapConditionType,
        amount_to_swap: i128,
        min_amount_out: i128,
        max_slippage: u32,
        expires_at: u64,
    ) -> u64 {
        let config = Self::load_config(env);
        owner.require_auth();

        if amount_to_swap <= 0 || min_amount_out < 0 || max_slippage as i128 > BPS_DENOMINATOR {
            panic_with_error!(env, SwapError::InvalidAmount);
        }
        if source_token == destination_token {
            panic_with_error!(env, SwapError::InvalidTokenPair);
        }
        let now = env.ledger().timestamp();
        if expires_at <= now || expires_at - now > MAX_CONDITION_DURATION_SECS {
            panic_with_error!(env, SwapError::InvalidExpiry);
        }
        match condition_type {
            // 100% or more would need a price <= 0, which is never accepted.
            SwapConditionType::PercentageDecrease(percentage) if percentage >= 100 => {
                panic_with_error!(env, SwapError::InvalidAmount)
            }
            SwapConditionType::TargetPrice(price) if price <= 0 => {
                panic_with_error!(env, SwapError::InvalidPrice)
            }
            _ => {}
        }

        let reference_price = Self::get_current_price(
            env,
            &config.oracle,
            config.max_price_age_secs,
            &source_asset,
            &destination_asset,
        );

        token::Client::new(env, &source_token).transfer(
            &owner,
            &env.current_contract_address(),
            &amount_to_swap,
        );

        let storage = env.storage().instance();
        let mut next_id: u64 = storage.get(&NEXT_CONDITION_ID).unwrap_or(1);

        let condition = SwapCondition {
            id: next_id,
            owner,
            source_asset,
            destination_asset,
            source_token,
            destination_token,
            oracle: config.oracle,
            router: config.router,
            condition_type,
            amount_to_swap,
            min_amount_out,
            max_slippage,
            reference_price,
            created_at: env.ledger().timestamp(),
            expires_at,
            status: SwapStatus::Active,
        };

        Self::save_condition(env, &condition);
        events::created(
            env,
            &condition.owner,
            next_id,
            &condition.source_token,
            &condition.destination_token,
            amount_to_swap,
            expires_at,
        );
        let mut owner_ids = Self::owner_condition_ids(env, &condition.owner);
        owner_ids.push_back(next_id);
        Self::save_owner_condition_ids(env, &condition.owner, &owner_ids);

        // Increment next ID
        next_id += 1;
        storage.set(&NEXT_CONDITION_ID, &next_id);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        next_id - 1
    }

    /// Execute a swap condition if conditions are met. Returns `None` when
    /// the condition had expired: it is marked `Expired` instead.
    pub fn execute_swap_condition(env: &Env, condition_id: u64) -> Option<SwapExecution> {
        let config = Self::load_config(env);
        let storage = env.storage().instance();
        let mut condition = Self::active_condition(env, condition_id);

        // Expired (strictly after `expires_at`, which itself still executes):
        // refund the owner instead of swapping
        if env.ledger().timestamp() > condition.expires_at {
            Self::refund(env, &condition);
            Self::close(env, &mut condition, SwapStatus::Expired);
            events::expired(
                env,
                &condition.owner,
                condition_id,
                condition.amount_to_swap,
            );
            storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
            return None;
        }

        let current_price = Self::get_current_price(
            env,
            &condition.oracle,
            config.max_price_age_secs,
            &condition.source_asset,
            &condition.destination_asset,
        );

        // Check if condition is met
        if !Self::is_condition_met(env, &condition, current_price, config.target_tolerance_bps) {
            panic_with_error!(env, SwapError::ConditionNotMet);
        }

        // Execute the swap
        let actual_amount_out = Self::execute_swap(env, &condition, current_price);

        Self::close(env, &mut condition, SwapStatus::Executed);
        events::executed(
            env,
            &condition.owner,
            condition_id,
            condition.amount_to_swap,
            actual_amount_out,
            current_price,
        );

        // Record execution
        let execution = SwapExecution {
            condition_id,
            executed_at: env.ledger().timestamp(),
            actual_amount_out,
            price_at_execution: current_price,
            ledger_sequence: env.ledger().sequence(),
        };

        let key = DataKey::Execution(condition_id);
        let persistent = env.storage().persistent();
        persistent.set(&key, &execution);
        persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        Some(execution)
    }

    pub fn get_condition(env: &Env, condition_id: u64) -> SwapCondition {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        Self::load_condition(env, condition_id)
    }

    /// Get all active swap conditions for an owner. Reads only that
    /// owner's index and conditions.
    pub fn get_active_conditions(env: &Env, owner: Address) -> Vec<SwapCondition> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        let mut active_conditions = Vec::new(env);
        for id in Self::owner_condition_ids(env, &owner).iter() {
            active_conditions.push_back(Self::load_condition(env, id));
        }
        active_conditions
    }

    /// Cancel a swap condition. Signed by its owner.
    pub fn cancel_condition(env: &Env, condition_id: u64, owner: Address) {
        let storage = env.storage().instance();
        let mut condition = Self::active_condition(env, condition_id);

        // Check ownership
        if condition.owner != owner {
            panic_with_error!(env, SwapError::Unauthorized);
        }
        owner.require_auth();

        Self::refund(env, &condition);
        Self::close(env, &mut condition, SwapStatus::Cancelled);
        events::cancelled(
            env,
            &condition.owner,
            condition_id,
            condition.amount_to_swap,
        );
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Get swap execution history: empty, or the condition's one execution.
    pub fn get_execution_history(env: &Env, condition_id: u64) -> Vec<SwapExecution> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        let key = DataKey::Execution(condition_id);
        let persistent = env.storage().persistent();
        let mut history = Vec::new(env);
        if let Some(execution) = persistent.get::<_, SwapExecution>(&key) {
            persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
            history.push_back(execution);
        }
        history
    }
}

impl SmartSwapContract {
    fn validate_config(env: &Env, max_price_age_secs: u64, target_tolerance_bps: u32) {
        if max_price_age_secs == 0 || target_tolerance_bps as i128 > BPS_DENOMINATOR {
            panic_with_error!(env, SwapError::InvalidConfig);
        }
    }

    fn load_config(env: &Env) -> Config {
        env.storage()
            .instance()
            .get(&CONFIG)
            .unwrap_or_else(|| panic_with_error!(env, SwapError::NotInitialized))
    }

    fn load_condition(env: &Env, condition_id: u64) -> SwapCondition {
        let key = DataKey::Condition(condition_id);
        let persistent = env.storage().persistent();
        let condition = persistent
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(env, SwapError::ConditionNotFound));
        persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        condition
    }

    fn save_condition(env: &Env, condition: &SwapCondition) {
        let key = DataKey::Condition(condition.id);
        let persistent = env.storage().persistent();
        persistent.set(&key, condition);
        persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    fn owner_condition_ids(env: &Env, owner: &Address) -> Vec<u64> {
        let key = DataKey::OwnerConditions(owner.clone());
        let persistent = env.storage().persistent();
        match persistent.get(&key) {
            Some(ids) => {
                persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
                ids
            }
            None => Vec::new(env),
        }
    }

    fn save_owner_condition_ids(env: &Env, owner: &Address, ids: &Vec<u64>) {
        let key = DataKey::OwnerConditions(owner.clone());
        let persistent = env.storage().persistent();
        if ids.is_empty() {
            persistent.remove(&key);
        } else {
            persistent.set(&key, ids);
            persistent.extend_ttl(&key, INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        }
    }

    /// Store a terminal status and drop the id from the owner's index.
    fn close(env: &Env, condition: &mut SwapCondition, status: SwapStatus) {
        condition.status = status;
        Self::save_condition(env, condition);
        let mut ids = Self::owner_condition_ids(env, &condition.owner);
        if let Some(index) = ids.first_index_of(condition.id) {
            ids.remove(index);
        }
        Self::save_owner_condition_ids(env, &condition.owner, &ids);
    }

    fn active_condition(env: &Env, condition_id: u64) -> SwapCondition {
        let condition = Self::load_condition(env, condition_id);
        if condition.status != SwapStatus::Active {
            panic_with_error!(env, SwapError::ConditionNotActive);
        }
        condition
    }

    /// Fresh, positive oracle price of `source_asset` in `destination_asset`.
    fn get_current_price(
        env: &Env,
        oracle: &Address,
        max_price_age_secs: u64,
        source_asset: &Symbol,
        destination_asset: &Symbol,
    ) -> i128 {
        let result = OracleClient::new(env, oracle).get_price_checked(
            source_asset,
            destination_asset,
            &max_price_age_secs,
        );
        // Also checked locally: both oracles treat a future timestamp as age 0.
        let now = env.ledger().timestamp();
        let timestamp = result.entry.timestamp;
        if result.is_stale || timestamp > now || now - timestamp > max_price_age_secs {
            panic_with_error!(env, SwapError::PriceStale);
        }
        if result.entry.price <= 0 {
            panic_with_error!(env, SwapError::InvalidPrice);
        }
        result.entry.price
    }

    fn is_condition_met(
        env: &Env,
        condition: &SwapCondition,
        current_price: i128,
        target_tolerance_bps: u32,
    ) -> bool {
        let reference = condition.reference_price;
        match condition.condition_type {
            SwapConditionType::PercentageIncrease(percentage) => {
                let delta = Self::mul_div(env, reference, percentage as i128, 100);
                current_price >= Self::checked(env, reference.checked_add(delta))
            }
            SwapConditionType::PercentageDecrease(percentage) => {
                let delta = Self::mul_div(env, reference, percentage as i128, 100);
                current_price <= Self::checked(env, reference.checked_sub(delta))
            }
            SwapConditionType::TargetPrice(target) => {
                let distance = Self::checked(env, current_price.checked_sub(target)).abs();
                Self::checked(env, distance.checked_mul(BPS_DENOMINATOR))
                    <= Self::checked(env, target.checked_mul(target_tolerance_bps as i128))
            }
            SwapConditionType::PriceAbove(price) => current_price > price,
            SwapConditionType::PriceBelow(price) => current_price < price,
        }
    }

    fn refund(env: &Env, condition: &SwapCondition) {
        token::Client::new(env, &condition.source_token).transfer(
            &env.current_contract_address(),
            &condition.owner,
            &condition.amount_to_swap,
        );
    }

    /// Swap the custodied `amount_to_swap` through the router and forward
    /// the output to the owner. The output is the contract's measured
    /// balance delta, not the router's return value.
    fn execute_swap(env: &Env, condition: &SwapCondition, current_price: i128) -> i128 {
        let this = env.current_contract_address();
        let amount_in = condition.amount_to_swap;

        let expected_out = Self::mul_div(env, amount_in, current_price, PRICE_SCALE);
        let slippage_floor = Self::mul_div(
            env,
            expected_out,
            BPS_DENOMINATOR - condition.max_slippage as i128,
            BPS_DENOMINATOR,
        );
        let amount_out_min = condition.min_amount_out.max(slippage_floor);

        let router = RouterClient::new(env, &condition.router);
        let source = token::Client::new(env, &condition.source_token);
        let destination = token::Client::new(env, &condition.destination_token);
        let pair = router.router_pair_for(&condition.source_token, &condition.destination_token);

        let source_before = source.balance(&this);
        let destination_before = destination.balance(&this);

        // The router moves `amount_in` from `to` (this contract) to the pair.
        // That transfer is not invoked by this contract directly, so it is
        // authorized here for that exact pair and amount and nothing else.
        // The authorization only covers the very next call (the router).
        env.authorize_as_current_contract(vec![
            env,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: condition.source_token.clone(),
                    fn_name: Symbol::new(env, "transfer"),
                    args: (this.clone(), pair, amount_in).into_val(env),
                },
                sub_invocations: vec![env],
            }),
        ]);

        router.swap_exact_tokens_for_tokens(
            &amount_in,
            &amount_out_min,
            &vec![
                env,
                condition.source_token.clone(),
                condition.destination_token.clone(),
            ],
            &this,
            &(env.ledger().timestamp() + SWAP_DEADLINE_SECS),
        );
        let destination_after = destination.balance(&this);

        if source_before - source.balance(&this) != amount_in {
            panic_with_error!(env, SwapError::InvalidAmount);
        }
        let actual_amount_out = destination_after - destination_before;
        if actual_amount_out < amount_out_min {
            panic_with_error!(env, SwapError::InsufficientOutput);
        }

        destination.transfer(&this, &condition.owner, &actual_amount_out);
        actual_amount_out
    }

    fn mul_div(env: &Env, a: i128, b: i128, denominator: i128) -> i128 {
        Self::checked(
            env,
            a.checked_mul(b).and_then(|v| v.checked_div(denominator)),
        )
    }

    fn checked(env: &Env, value: Option<i128>) -> i128 {
        value.unwrap_or_else(|| panic_with_error!(env, SwapError::InvalidPrice))
    }
}

#[cfg(test)]
mod test;
