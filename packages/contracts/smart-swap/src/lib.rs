//! Smart Swap Contract for Galaxy DevKit
//! 
//! This contract implements automated token swapping with price conditions
//! and slippage protection for the Stellar ecosystem.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env, Map, Symbol,
    Vec, String as SorobanString,
};

/// Contract type definitions
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

/// Contract storage keys
const SWAP_CONDITIONS: Symbol = symbol_short!("SWAP_COND");
const SWAP_EXECUTIONS: Symbol = symbol_short!("SWAP_EXEC");
const NEXT_CONDITION_ID: Symbol = symbol_short!("NEXT_ID");
const PRICE_ORACLE: Symbol = symbol_short!("PRICE_ORACLE");

/// Smart Swap Contract
#[contract]
pub struct SmartSwapContract;

/// Contract implementation
#[contractimpl]
impl SmartSwapContract {
    /// Initialize the contract
    pub fn initialize(env: &Env, price_oracle: Address) {
        let storage = env.storage().instance();
        storage.set(&PRICE_ORACLE, &price_oracle);
        storage.set(&NEXT_CONDITION_ID, &1u64);
    }

    /// Create a new swap condition
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
    ) -> u64 {
        let storage = env.storage().instance();
        let mut next_id: u64 = storage.get(&NEXT_CONDITION_ID).unwrap_or(1);
        
        let condition = SwapCondition {
            id: next_id,
            owner: owner.clone(),
            source_asset,
            destination_asset,
            condition_type,
            amount_to_swap,
            min_amount_out,
            max_slippage,
            reference_price: 0, // Will be set when condition is checked
            created_at: env.ledger().timestamp(),
            expires_at,
            status: SwapStatus::Active,
        };

        // Store the condition
        let mut conditions: Map<u64, SwapCondition> = storage.get(&SWAP_CONDITIONS).unwrap_or(Map::new(&env));
        conditions.set(next_id, condition);
        storage.set(&SWAP_CONDITIONS, &conditions);
        
        // Increment next ID
        next_id += 1;
        storage.set(&NEXT_CONDITION_ID, &next_id);

        next_id - 1
    }

    /// Execute a swap condition if conditions are met
    pub fn execute_swap_condition(env: &Env, condition_id: u64) -> SwapExecution {
        let storage = env.storage().instance();
        let mut conditions: Map<u64, SwapCondition> = storage.get(&SWAP_CONDITIONS).unwrap_or(Map::new(&env));
        
        let mut condition = conditions.get(condition_id).unwrap();
        
        // Check if condition is still active
        if condition.status != SwapStatus::Active {
            panic!("Condition is not active");
        }

        // Check if condition has expired
        if env.ledger().timestamp() > condition.expires_at {
            condition.status = SwapStatus::Expired;
            conditions.set(condition_id, condition);
            storage.set(&SWAP_CONDITIONS, &conditions);
            panic!("Condition has expired");
        }

        // Get current price from oracle
        let price_oracle: Address = storage.get(&PRICE_ORACLE).unwrap();
        let current_price = Self::get_current_price(env, &price_oracle, &condition.source_asset, &condition.destination_asset);
        
        // Check if condition is met
        if !Self::is_condition_met(&condition, current_price) {
            panic!("Condition not met");
        }

        // Execute the swap
        let actual_amount_out = Self::execute_swap(
            env,
            &condition.owner,
            &condition.source_asset,
            &condition.destination_asset,
            condition.amount_to_swap,
            condition.min_amount_out,
            condition.max_slippage,
        );

        // Update condition status
        condition.status = SwapStatus::Executed;
        condition.reference_price = current_price;
        conditions.set(condition_id, condition);
        storage.set(&SWAP_CONDITIONS, &conditions);

        // Record execution
        let execution = SwapExecution {
            condition_id,
            executed_at: env.ledger().timestamp(),
            actual_amount_out,
            price_at_execution: current_price,
            transaction_hash: env.current_contract_address().to_array(),
        };

        let mut executions: Vec<SwapExecution> = storage.get(&SWAP_EXECUTIONS).unwrap_or(Vec::new(&env));
        executions.push_back(execution.clone());
        storage.set(&SWAP_EXECUTIONS, &executions);

        execution
    }

    /// Get all active swap conditions for an owner
    pub fn get_active_conditions(env: &Env, owner: Address) -> Vec<SwapCondition> {
        let storage = env.storage().instance();
        let conditions: Map<u64, SwapCondition> = storage.get(&SWAP_CONDITIONS).unwrap_or(Map::new(&env));
        
        let mut active_conditions = Vec::new(&env);
        
        for (_, condition) in conditions.iter() {
            if condition.owner == owner && condition.status == SwapStatus::Active {
                active_conditions.push_back(condition);
            }
        }
        
        active_conditions
    }

    /// Cancel a swap condition
    pub fn cancel_condition(env: &Env, condition_id: u64, owner: Address) {
        let storage = env.storage().instance();
        let mut conditions: Map<u64, SwapCondition> = storage.get(&SWAP_CONDITIONS).unwrap_or(Map::new(&env));
        
        let mut condition = conditions.get(condition_id).unwrap();
        
        // Check ownership
        if condition.owner != owner {
            panic!("Not authorized");
        }
        
        // Check if condition is still active
        if condition.status != SwapStatus::Active {
            panic!("Condition is not active");
        }
        
        // Cancel the condition
        condition.status = SwapStatus::Cancelled;
        conditions.set(condition_id, condition);
        storage.set(&SWAP_CONDITIONS, &conditions);
    }

    /// Get swap execution history
    pub fn get_execution_history(env: &Env, condition_id: u64) -> Vec<SwapExecution> {
        let storage = env.storage().instance();
        let executions: Vec<SwapExecution> = storage.get(&SWAP_EXECUTIONS).unwrap_or(Vec::new(&env));
        
        let mut filtered_executions = Vec::new(&env);
        
        for execution in executions.iter() {
            if execution.condition_id == condition_id {
                filtered_executions.push_back(execution);
            }
        }
        
        filtered_executions
    }

    /// Helper function to get current price from oracle
    fn get_current_price(
        env: &Env,
        price_oracle: &Address,
        source_asset: &Symbol,
        destination_asset: &Symbol,
    ) -> u64 {
        // This would typically call a price oracle contract
        // For now, return a mock price
        1000 // Mock price
    }

    /// Helper function to check if condition is met
    fn is_condition_met(condition: &SwapCondition, current_price: u64) -> bool {
        match &condition.condition_type {
            SwapConditionType::PercentageIncrease(percentage) => {
                let threshold = condition.reference_price + (condition.reference_price * *percentage as u64 / 100);
                current_price >= threshold
            }
            SwapConditionType::PercentageDecrease(percentage) => {
                let threshold = condition.reference_price - (condition.reference_price * *percentage as u64 / 100);
                current_price <= threshold
            }
            SwapConditionType::TargetPrice(price) => current_price == *price,
            SwapConditionType::PriceAbove(price) => current_price > *price,
            SwapConditionType::PriceBelow(price) => current_price < *price,
        }
    }

    /// Helper function to execute the actual swap
    fn execute_swap(
        env: &Env,
        owner: &Address,
        source_asset: &Symbol,
        destination_asset: &Symbol,
        amount_in: u64,
        min_amount_out: u64,
        max_slippage: u32,
    ) -> u64 {
        // This would typically interact with a DEX or AMM
        // For now, return a mock amount
        min_amount_out
    }
}

#[cfg(test)]
mod test;

