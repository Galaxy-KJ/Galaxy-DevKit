//! Security Limits Contract for Galaxy DevKit
//! 
//! This contract implements security limits and risk management
//! for automated trading operations in the Stellar ecosystem.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env, Map, Symbol,
    Vec, String as SorobanString,
};

/// Contract type definitions
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecurityLimit {
    pub id: u64,
    pub owner: Address,
    pub limit_type: LimitType,
    pub asset: Symbol,
    pub max_amount: u64,
    pub time_window: u64,
    pub current_usage: u64,
    pub last_reset: u64,
    pub is_active: bool,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LimitType {
    Daily,
    Weekly,
    Monthly,
    PerTransaction,
    PerHour,
    Custom(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransactionRecord {
    pub id: u64,
    pub owner: Address,
    pub asset: Symbol,
    pub amount: u64,
    pub timestamp: u64,
    pub transaction_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RiskProfile {
    pub owner: Address,
    pub risk_level: RiskLevel,
    pub max_daily_volume: u64,
    pub max_single_transaction: u64,
    pub allowed_assets: Vec<Symbol>,
    pub blacklisted_assets: Vec<Symbol>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Restricted,
}

/// Contract storage keys
const SECURITY_LIMITS: Symbol = symbol_short!("SEC_LIMITS");
const TRANSACTION_RECORDS: Symbol = symbol_short!("TX_RECORDS");
const RISK_PROFILES: Symbol = symbol_short!("RISK_PROFILES");
const NEXT_LIMIT_ID: Symbol = symbol_short!("NEXT_LIMIT_ID");
const NEXT_TX_ID: Symbol = symbol_short!("NEXT_TX_ID");

/// Security Limits Contract
#[contract]
pub struct SecurityLimitsContract;

/// Contract implementation
#[contractimpl]
impl SecurityLimitsContract {
    /// Initialize the contract
    pub fn initialize(env: &Env) {
        let storage = env.storage().instance();
        storage.set(&NEXT_LIMIT_ID, &1u64);
        storage.set(&NEXT_TX_ID, &1u64);
    }

    /// Create a new security limit
    pub fn create_security_limit(
        env: &Env,
        owner: Address,
        limit_type: LimitType,
        asset: Symbol,
        max_amount: u64,
        time_window: u64,
    ) -> u64 {
        let storage = env.storage().instance();
        let mut next_id: u64 = storage.get(&NEXT_LIMIT_ID).unwrap_or(1);
        
        let limit = SecurityLimit {
            id: next_id,
            owner: owner.clone(),
            limit_type,
            asset,
            max_amount,
            time_window,
            current_usage: 0,
            last_reset: env.ledger().timestamp(),
            is_active: true,
            created_at: env.ledger().timestamp(),
        };

        // Store the limit
        let mut limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        limits.set(next_id, limit);
        storage.set(&SECURITY_LIMITS, &limits);
        
        // Increment next ID
        next_id += 1;
        storage.set(&NEXT_LIMIT_ID, &next_id);

        next_id - 1
    }

    /// Check if a transaction is allowed within security limits
    pub fn check_transaction_allowed(
        env: &Env,
        owner: Address,
        asset: Symbol,
        amount: u64,
    ) -> bool {
        let storage = env.storage().instance();
        let limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        
        let current_time = env.ledger().timestamp();
        
        for (_, limit) in limits.iter() {
            if limit.owner == owner && limit.asset == asset && limit.is_active {
                // Check if limit applies to this time window
                if Self::is_limit_applicable(&limit, current_time) {
                    // Reset usage if time window has passed
                    let mut updated_limit = limit.clone();
                    if current_time - limit.last_reset > limit.time_window {
                        updated_limit.current_usage = 0;
                        updated_limit.last_reset = current_time;
                    }
                    
                    // Check if transaction would exceed limit
                    if updated_limit.current_usage + amount > limit.max_amount {
                        return false;
                    }
                }
            }
        }
        
        true
    }

    /// Record a transaction
    pub fn record_transaction(
        env: &Env,
        owner: Address,
        asset: Symbol,
        amount: u64,
        transaction_hash: BytesN<32>,
    ) -> u64 {
        let storage = env.storage().instance();
        let mut next_tx_id: u64 = storage.get(&NEXT_TX_ID).unwrap_or(1);
        
        let record = TransactionRecord {
            id: next_tx_id,
            owner: owner.clone(),
            asset,
            amount,
            timestamp: env.ledger().timestamp(),
            transaction_hash,
        };

        // Store the transaction record
        let mut records: Vec<TransactionRecord> = storage.get(&TRANSACTION_RECORDS).unwrap_or(Vec::new(&env));
        records.push_back(record.clone());
        storage.set(&TRANSACTION_RECORDS, &records);
        
        // Update security limits usage
        Self::update_limit_usage(env, &owner, &asset, amount);
        
        // Increment next ID
        next_tx_id += 1;
        storage.set(&NEXT_TX_ID, &next_tx_id);

        next_tx_id - 1
    }

    /// Get security limits for an owner
    pub fn get_security_limits(env: &Env, owner: Address) -> Vec<SecurityLimit> {
        let storage = env.storage().instance();
        let limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        
        let mut owner_limits = Vec::new(&env);
        
        for (_, limit) in limits.iter() {
            if limit.owner == owner {
                owner_limits.push_back(limit);
            }
        }
        
        owner_limits
    }

    /// Update a security limit
    pub fn update_security_limit(
        env: &Env,
        limit_id: u64,
        owner: Address,
        max_amount: u64,
        time_window: u64,
        is_active: bool,
    ) {
        let storage = env.storage().instance();
        let mut limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        
        let mut limit = limits.get(limit_id).unwrap();
        
        // Check ownership
        if limit.owner != owner {
            panic!("Not authorized");
        }
        
        // Update limit
        limit.max_amount = max_amount;
        limit.time_window = time_window;
        limit.is_active = is_active;
        
        limits.set(limit_id, limit);
        storage.set(&SECURITY_LIMITS, &limits);
    }

    /// Delete a security limit
    pub fn delete_security_limit(env: &Env, limit_id: u64, owner: Address) {
        let storage = env.storage().instance();
        let mut limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        
        let limit = limits.get(limit_id).unwrap();
        
        // Check ownership
        if limit.owner != owner {
            panic!("Not authorized");
        }
        
        // Remove limit
        limits.remove(limit_id);
        storage.set(&SECURITY_LIMITS, &limits);
    }

    /// Create or update risk profile
    pub fn set_risk_profile(
        env: &Env,
        owner: Address,
        risk_level: RiskLevel,
        max_daily_volume: u64,
        max_single_transaction: u64,
        allowed_assets: Vec<Symbol>,
        blacklisted_assets: Vec<Symbol>,
    ) {
        let storage = env.storage().instance();
        let mut profiles: Map<Address, RiskProfile> = storage.get(&RISK_PROFILES).unwrap_or(Map::new(&env));
        
        let profile = RiskProfile {
            owner: owner.clone(),
            risk_level,
            max_daily_volume,
            max_single_transaction,
            allowed_assets,
            blacklisted_assets,
            created_at: profiles.get(owner.clone()).map(|p| p.created_at).unwrap_or(env.ledger().timestamp()),
            updated_at: env.ledger().timestamp(),
        };
        
        profiles.set(owner, profile);
        storage.set(&RISK_PROFILES, &profiles);
    }

    /// Get risk profile for an owner
    pub fn get_risk_profile(env: &Env, owner: Address) -> Option<RiskProfile> {
        let storage = env.storage().instance();
        let profiles: Map<Address, RiskProfile> = storage.get(&RISK_PROFILES).unwrap_or(Map::new(&env));
        profiles.get(owner)
    }

    /// Check if asset is allowed for owner
    pub fn is_asset_allowed(env: &Env, owner: Address, asset: Symbol) -> bool {
        if let Some(profile) = Self::get_risk_profile(env, owner) {
            // Check if asset is blacklisted
            for blacklisted_asset in profile.blacklisted_assets.iter() {
                if *blacklisted_asset == asset {
                    return false;
                }
            }
            
            // Check if asset is in allowed list (if allowed list is not empty)
            if profile.allowed_assets.len() > 0 {
                for allowed_asset in profile.allowed_assets.iter() {
                    if *allowed_asset == asset {
                        return true;
                    }
                }
                return false;
            }
        }
        
        true // Default to allowed if no profile exists
    }

    /// Helper function to check if limit is applicable
    fn is_limit_applicable(limit: &SecurityLimit, current_time: u64) -> bool {
        match limit.limit_type {
            LimitType::Daily => current_time - limit.last_reset < 86400, // 24 hours
            LimitType::Weekly => current_time - limit.last_reset < 604800, // 7 days
            LimitType::Monthly => current_time - limit.last_reset < 2592000, // 30 days
            LimitType::PerTransaction => true,
            LimitType::PerHour => current_time - limit.last_reset < 3600, // 1 hour
            LimitType::Custom(window) => current_time - limit.last_reset < window,
        }
    }

    /// Helper function to update limit usage
    fn update_limit_usage(env: &Env, owner: &Address, asset: &Symbol, amount: u64) {
        let storage = env.storage().instance();
        let mut limits: Map<u64, SecurityLimit> = storage.get(&SECURITY_LIMITS).unwrap_or(Map::new(&env));
        
        for (id, mut limit) in limits.iter() {
            if limit.owner == *owner && limit.asset == *asset && limit.is_active {
                limit.current_usage += amount;
                limits.set(id, limit);
            }
        }
        
        storage.set(&SECURITY_LIMITS, &limits);
    }
}

#[cfg(test)]
mod test;

