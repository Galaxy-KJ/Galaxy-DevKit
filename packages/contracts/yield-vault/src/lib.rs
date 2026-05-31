//! Yield Vault Soroban Contract for Galaxy DevKit
//!
//! ERC-4626-inspired vault: users deposit assets and receive share tokens
//! representing pro-rata ownership. The vault admin configures strategy
//! allocations across Blend and Soroswap. A `harvest` call auto-compounds
//! accrued yield back into the vault, increasing the share price.

#![no_std]

mod strategy;

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, Env, Map, Symbol, Vec,
};

pub use strategy::{StrategyAllocation, StrategyType};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const ADMIN: Symbol = symbol_short!("ADMIN");
const ASSET: Symbol = symbol_short!("ASSET");
const TOTAL_SHARES: Symbol = symbol_short!("TOT_SHR");
const TOTAL_ASSETS: Symbol = symbol_short!("TOT_AST");
const BALANCES: Symbol = symbol_short!("BALS");
const STRATEGIES: Symbol = symbol_short!("STRATS");
const LAST_HARVEST: Symbol = symbol_short!("LST_HRV");

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

/// Result returned from a successful withdrawal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawResult {
    /// Shares burned
    pub shares_burned: u64,
    /// Underlying assets returned to the user
    pub assets_returned: u64,
}

/// Snapshot of vault state returned by `get_vault_info`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultInfo {
    pub admin: Address,
    pub asset: Address,
    pub total_shares: u64,
    pub total_assets: u64,
    pub last_harvest: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct YieldVaultContract;

#[contractimpl]
impl YieldVaultContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the vault.
    ///
    /// * `admin`  – address that can update strategies and call `harvest`
    /// * `asset`  – the underlying token contract address
    pub fn initialize(env: Env, admin: Address, asset: Address) {
        let storage = env.storage().instance();
        if storage.has(&ADMIN) {
            panic!("already initialized");
        }
        storage.set(&ADMIN, &admin);
        storage.set(&ASSET, &asset);
        storage.set(&TOTAL_SHARES, &0u64);
        storage.set(&TOTAL_ASSETS, &0u64);
        storage.set(&LAST_HARVEST, &env.ledger().timestamp());
    }

    // -----------------------------------------------------------------------
    // Core vault operations
    // -----------------------------------------------------------------------

    /// Deposit `amount` of the underlying asset and mint shares to `depositor`.
    ///
    /// Returns the number of shares minted.
    pub fn deposit(env: Env, depositor: Address, amount: u64) -> u64 {
        depositor.require_auth();
        if amount == 0 {
            panic!("amount must be > 0");
        }

        let storage = env.storage().instance();
        let total_assets: u64 = storage.get(&TOTAL_ASSETS).unwrap_or(0);
        let total_shares: u64 = storage.get(&TOTAL_SHARES).unwrap_or(0);

        // shares_to_mint = amount * total_shares / total_assets  (ERC-4626 formula)
        // When the vault is empty the ratio is 1:1.
        let shares_to_mint = if total_shares == 0 || total_assets == 0 {
            amount
        } else {
            amount
                .checked_mul(total_shares)
                .expect("overflow")
                .checked_div(total_assets)
                .expect("div by zero")
        };

        if shares_to_mint == 0 {
            panic!("deposit too small");
        }

        // Update balances
        let mut balances: Map<Address, u64> =
            storage.get(&BALANCES).unwrap_or(Map::new(&env));
        let current = balances.get(depositor.clone()).unwrap_or(0);
        balances.set(depositor, current + shares_to_mint);

        storage.set(&BALANCES, &balances);
        storage.set(&TOTAL_SHARES, &(total_shares + shares_to_mint));
        storage.set(&TOTAL_ASSETS, &(total_assets + amount));

        shares_to_mint
    }

    /// Burn `shares` and return the proportional underlying assets to `owner`.
    pub fn withdraw(env: Env, owner: Address, shares: u64) -> WithdrawResult {
        owner.require_auth();
        if shares == 0 {
            panic!("shares must be > 0");
        }

        let storage = env.storage().instance();
        let total_assets: u64 = storage.get(&TOTAL_ASSETS).unwrap_or(0);
        let total_shares: u64 = storage.get(&TOTAL_SHARES).unwrap_or(0);

        if total_shares == 0 {
            panic!("vault is empty");
        }

        let mut balances: Map<Address, u64> =
            storage.get(&BALANCES).unwrap_or(Map::new(&env));
        let user_shares = balances.get(owner.clone()).unwrap_or(0);

        if user_shares < shares {
            panic!("insufficient shares");
        }

        // assets_to_return = shares * total_assets / total_shares
        let assets_to_return = shares
            .checked_mul(total_assets)
            .expect("overflow")
            .checked_div(total_shares)
            .expect("div by zero");

        // Update balances
        balances.set(owner, user_shares - shares);
        storage.set(&BALANCES, &balances);
        storage.set(&TOTAL_SHARES, &(total_shares - shares));
        storage.set(&TOTAL_ASSETS, &(total_assets - assets_to_return));

        WithdrawResult {
            shares_burned: shares,
            assets_returned: assets_to_return,
        }
    }

    /// Harvest yield: adds `yield_amount` to `total_assets`, auto-compounding
    /// earnings for all share holders without minting new shares.
    ///
    /// Only callable by the vault admin.
    pub fn harvest(env: Env, yield_amount: u64) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&ADMIN).unwrap();
        admin.require_auth();

        let total_assets: u64 = storage.get(&TOTAL_ASSETS).unwrap_or(0);
        storage.set(&TOTAL_ASSETS, &(total_assets + yield_amount));
        storage.set(&LAST_HARVEST, &env.ledger().timestamp());
    }

    // -----------------------------------------------------------------------
    // Strategy management (admin only)
    // -----------------------------------------------------------------------

    /// Replace the full strategy allocation list.
    ///
    /// The sum of `weight_bps` across all active strategies must equal 10 000.
    pub fn set_strategies(env: Env, strategies: Vec<StrategyAllocation>) {
        let storage = env.storage().instance();
        let admin: Address = storage.get(&ADMIN).unwrap();
        admin.require_auth();

        // Validate weights sum to 10 000
        let mut total_weight: u32 = 0;
        for s in strategies.iter() {
            if s.is_active() {
                total_weight += s.weight_bps;
            }
        }
        if total_weight != 10_000 {
            panic!("active strategy weights must sum to 10000 bps");
        }

        storage.set(&STRATEGIES, &strategies);
    }

    /// Return the current strategy allocations.
    pub fn get_strategies(env: Env) -> Vec<StrategyAllocation> {
        env.storage()
            .instance()
            .get(&STRATEGIES)
            .unwrap_or(vec![&env])
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// Current value of one share expressed in underlying asset units.
    ///
    /// Returns 0 when no shares have been issued yet.
    pub fn get_share_value(env: Env) -> u64 {
        let storage = env.storage().instance();
        let total_shares: u64 = storage.get(&TOTAL_SHARES).unwrap_or(0);
        let total_assets: u64 = storage.get(&TOTAL_ASSETS).unwrap_or(0);

        if total_shares == 0 {
            return 0;
        }
        // Scaled by 1e7 to preserve precision (7 decimal places like Stellar)
        total_assets
            .checked_mul(10_000_000)
            .expect("overflow")
            .checked_div(total_shares)
            .expect("div by zero")
    }

    /// Total underlying assets managed by the vault.
    pub fn get_total_value_locked(env: Env) -> u64 {
        env.storage().instance().get(&TOTAL_ASSETS).unwrap_or(0)
    }

    /// Share balance of a specific user.
    pub fn get_balance(env: Env, user: Address) -> u64 {
        let balances: Map<Address, u64> = env
            .storage()
            .instance()
            .get(&BALANCES)
            .unwrap_or(Map::new(&env));
        balances.get(user).unwrap_or(0)
    }

    /// Full vault state snapshot.
    pub fn get_vault_info(env: Env) -> VaultInfo {
        let storage = env.storage().instance();
        VaultInfo {
            admin: storage.get(&ADMIN).unwrap(),
            asset: storage.get(&ASSET).unwrap(),
            total_shares: storage.get(&TOTAL_SHARES).unwrap_or(0),
            total_assets: storage.get(&TOTAL_ASSETS).unwrap_or(0),
            last_harvest: storage.get(&LAST_HARVEST).unwrap_or(0),
        }
    }
}

#[cfg(test)]
mod test;
