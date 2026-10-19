//! Smart Swap Contract for Galaxy DevKit
//!
//! This contract implements automated token swapping with price conditions.
//! Conditions and execution records are individually stored in persistent
//! storage, avoiding unbounded instance-storage entries.

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapCondition {
    pub id: u64,
    pub owner: Address,
    pub source_asset: Symbol,
    pub destination_asset: Symbol,
    pub condition_type: SwapConditionType,
    pub amount_to_swap: u64,
    pub min_amount_out: u64,
    pub max_slippage: u32,
    pub reference_price: u64,
    pub created_at: u64,
    pub expires_at: u64,
    pub status: SwapStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapConditionType {
    PercentageIncrease(u32),
    PercentageDecrease(u32),
    TargetPrice(u64),
    PriceAbove(u64),
    PriceBelow(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapStatus {
    Active,
    Executed,
    Expired,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapExecution {
    pub condition_id: u64,
    pub executed_at: u64,
    pub actual_amount_out: u64,
    pub price_at_execution: u64,
    pub transaction_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    PriceOracle,
    NextConditionId,
    Condition(u64),
    OwnerConditions(Address),
    Execution(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum SmartSwapError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ConditionNotFound = 3,
    NotAuthorized = 4,
    ConditionNotActive = 5,
    ConditionExpired = 6,
    ConditionNotMet = 7,
    IdOverflow = 8,
    InvalidExpiration = 9,
}

// Ledger-sequence TTL values. Whenever the owner index is renewed, all
// indexed condition records must be renewed too, before the index is extended.
const INSTANCE_TTL_THRESHOLD: u32 = 60_480;
const INSTANCE_TTL_EXTEND: u32 = 120_960;
const PERSISTENT_TTL_THRESHOLD: u32 = 60_480;
const PERSISTENT_TTL_EXTEND: u32 = 120_960;

#[contract]
pub struct SmartSwapContract;

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
}

fn load_condition(env: &Env, id: u64) -> Result<SwapCondition, SmartSwapError> {
    let key = DataKey::Condition(id);
    let condition = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(SmartSwapError::ConditionNotFound)?;
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
    Ok(condition)
}

fn save_condition(env: &Env, condition: &SwapCondition) {
    let key = DataKey::Condition(condition.id);
    env.storage().persistent().set(&key, condition);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
}

fn load_owner_ids(env: &Env, owner: &Address) -> Vec<u64> {
    let key = DataKey::OwnerConditions(owner.clone());
    let storage = env.storage().persistent();
    let ids = storage.get(&key).unwrap_or(Vec::new(env));
    // Do not renew the index here: callers renew indexed records before
    // extending the index through save_owner_ids.
    ids
}

fn renew_indexed_conditions(env: &Env, ids: &Vec<u64>) {
    for id in ids.iter() {
        let key = DataKey::Condition(id);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND,
        );
    }
}

fn save_owner_ids(env: &Env, owner: &Address, ids: &Vec<u64>) {
    renew_indexed_conditions(env, ids);
    let key = DataKey::OwnerConditions(owner.clone());
    env.storage().persistent().set(&key, ids);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND);
}

fn remove_owner_id(env: &Env, owner: &Address, id: u64) {
    let mut ids = load_owner_ids(env, owner);
    if let Some(position) = ids.first_index_of(id) {
        ids.remove(position);
        save_owner_ids(env, owner, &ids);
    }
}

fn require_initialized(env: &Env) -> Result<(), SmartSwapError> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(SmartSwapError::NotInitialized);
    }
    Ok(())
}

#[contractimpl]
impl SmartSwapContract {
    /// Initializes contract once. The administrator must authorize the call.
    pub fn initialize(
        env: &Env,
        admin: Address,
        price_oracle: Address,
    ) -> Result<(), SmartSwapError> {
        let storage = env.storage().instance();
        // Reject before asking for authorization to make the guard deterministic.
        if storage.has(&DataKey::Admin) {
            return Err(SmartSwapError::AlreadyInitialized);
        }
        admin.require_auth();
        storage.set(&DataKey::Admin, &admin);
        storage.set(&DataKey::PriceOracle, &price_oracle);
        storage.set(&DataKey::NextConditionId, &1u64);
        bump_instance(env);
        Ok(())
    }

    /// Changes oracle only with the stored administrator's authorization.
    pub fn set_oracle(env: &Env, price_oracle: Address) -> Result<(), SmartSwapError> {
        require_initialized(env)?;
        let storage = env.storage().instance();
        let admin: Address = storage
            .get(&DataKey::Admin)
            .ok_or(SmartSwapError::NotInitialized)?;
        admin.require_auth();
        storage.set(&DataKey::PriceOracle, &price_oracle);
        bump_instance(env);
        Ok(())
    }

    pub fn create_swap_condition(
        env: &Env,
        owner: Address,
        source_asset: Symbol,
        destination_asset: Symbol,
        condition_type: SwapConditionType,
        amount_to_swap: u64,
        min_amount_out: u64,
        max_slippage: u32,
        expires_at: u64,
    ) -> Result<u64, SmartSwapError> {
        require_initialized(env)?;
        owner.require_auth();
        if expires_at <= env.ledger().timestamp() {
            return Err(SmartSwapError::InvalidExpiration);
        }

        let storage = env.storage().instance();
        let next_id: u64 = storage
            .get(&DataKey::NextConditionId)
            .ok_or(SmartSwapError::NotInitialized)?;
        let next = next_id.checked_add(1).ok_or(SmartSwapError::IdOverflow)?;
        let condition = SwapCondition {
            id: next_id,
            owner: owner.clone(),
            source_asset,
            destination_asset,
            condition_type,
            amount_to_swap,
            min_amount_out,
            max_slippage,
            reference_price: 0,
            created_at: env.ledger().timestamp(),
            expires_at,
            status: SwapStatus::Active,
        };
        save_condition(env, &condition);
        let mut ids = load_owner_ids(env, &owner);
        ids.push_back(next_id);
        save_owner_ids(env, &owner, &ids);
        storage.set(&DataKey::NextConditionId, &next);
        bump_instance(env);
        Ok(next_id)
    }

    pub fn execute_swap_condition(
        env: &Env,
        condition_id: u64,
    ) -> Result<SwapExecution, SmartSwapError> {
        require_initialized(env)?;
        let mut condition = load_condition(env, condition_id)?;
        if condition.status != SwapStatus::Active {
            return Err(SmartSwapError::ConditionNotActive);
        }
        if env.ledger().timestamp() > condition.expires_at {
            return Err(SmartSwapError::ConditionExpired);
        }

        let price_oracle: Address = env
            .storage()
            .instance()
            .get(&DataKey::PriceOracle)
            .ok_or(SmartSwapError::NotInitialized)?;
        let current_price = Self::get_current_price(
            env,
            &price_oracle,
            &condition.source_asset,
            &condition.destination_asset,
        );
        if !Self::is_condition_met(&condition, current_price) {
            return Err(SmartSwapError::ConditionNotMet);
        }

        let actual_amount_out = Self::execute_swap(
            env,
            &condition.owner,
            &condition.source_asset,
            &condition.destination_asset,
            condition.amount_to_swap,
            condition.min_amount_out,
            condition.max_slippage,
        );
        condition.status = SwapStatus::Executed;
        condition.reference_price = current_price;
        save_condition(env, &condition);
        remove_owner_id(env, &condition.owner, condition_id);

        let execution = SwapExecution {
            condition_id,
            executed_at: env.ledger().timestamp(),
            actual_amount_out,
            price_at_execution: current_price,
            transaction_hash: BytesN::from_array(env, &[0u8; 32]),
        };
        let key = DataKey::Execution(condition_id);
        env.storage().persistent().set(&key, &execution);
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_TTL_THRESHOLD,
            PERSISTENT_TTL_EXTEND,
        );
        bump_instance(env);
        Ok(execution)
    }

    pub fn get_active_conditions(env: &Env, owner: Address) -> Vec<SwapCondition> {
        let ids = load_owner_ids(env, &owner);
        let mut active = Vec::new(env);
        for id in ids.iter() {
            let key = DataKey::Condition(id);
            if let Some(condition) = env.storage().persistent().get::<_, SwapCondition>(&key) {
                if condition.status == SwapStatus::Active
                    && condition.expires_at > env.ledger().timestamp()
                {
                    env.storage().persistent().extend_ttl(
                        &key,
                        PERSISTENT_TTL_THRESHOLD,
                        PERSISTENT_TTL_EXTEND,
                    );
                    active.push_back(condition);
                }
            }
        }
        // Reading active records also renews the index, keeping its TTL
        // aligned with the records it references.
        if !ids.is_empty() {
            save_owner_ids(env, &owner, &ids);
        }
        active
    }

    pub fn cancel_condition(
        env: &Env,
        condition_id: u64,
        owner: Address,
    ) -> Result<(), SmartSwapError> {
        require_initialized(env)?;
        owner.require_auth();
        let mut condition = load_condition(env, condition_id)?;
        if condition.owner != owner {
            return Err(SmartSwapError::NotAuthorized);
        }
        if condition.status != SwapStatus::Active {
            return Err(SmartSwapError::ConditionNotActive);
        }
        condition.status = SwapStatus::Cancelled;
        save_condition(env, &condition);
        remove_owner_id(env, &condition.owner, condition_id);
        bump_instance(env);
        Ok(())
    }

    /// A swap executes at most once; history is a zero- or one-element vector.
    pub fn get_execution_history(env: &Env, condition_id: u64) -> Vec<SwapExecution> {
        let key = DataKey::Execution(condition_id);
        let mut out = Vec::new(env);
        if let Some(execution) = env.storage().persistent().get(&key) {
            out.push_back(execution);
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_TTL_THRESHOLD,
                PERSISTENT_TTL_EXTEND,
            );
        }
        out
    }

    fn get_current_price(
        _env: &Env,
        _price_oracle: &Address,
        _source_asset: &Symbol,
        _destination_asset: &Symbol,
    ) -> u64 {
        // Placeholder: oracle integration is outside the scope of this issue.
        1000
    }

    fn is_condition_met(condition: &SwapCondition, current_price: u64) -> bool {
        match &condition.condition_type {
            SwapConditionType::PercentageIncrease(percent) => {
                let increment = condition.reference_price.saturating_mul(*percent as u64) / 100;
                current_price >= condition.reference_price.saturating_add(increment)
            }
            SwapConditionType::PercentageDecrease(percent) => {
                let decrement = condition.reference_price.saturating_mul(*percent as u64) / 100;
                current_price <= condition.reference_price.saturating_sub(decrement)
            }
            SwapConditionType::TargetPrice(price) => current_price == *price,
            SwapConditionType::PriceAbove(price) => current_price > *price,
            SwapConditionType::PriceBelow(price) => current_price < *price,
        }
    }

    fn execute_swap(
        _env: &Env,
        _owner: &Address,
        _source_asset: &Symbol,
        _destination_asset: &Symbol,
        _amount_in: u64,
        min_amount_out: u64,
        _max_slippage: u32,
    ) -> u64 {
        // Placeholder: DEX integration is outside the scope of this issue.
        min_amount_out
    }
}

#[cfg(test)]
mod test;
