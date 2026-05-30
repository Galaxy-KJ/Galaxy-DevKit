//! Strategy interface for the Yield Vault contract.
//!
//! Defines the `StrategyAllocation` type and helpers for managing
//! how vault assets are distributed across Blend and Soroswap.

use soroban_sdk::{contracttype, Address, Symbol};

/// Identifies which underlying protocol a strategy targets.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StrategyType {
    /// Blend lending/borrowing protocol
    Blend,
    /// Soroswap DEX liquidity provision
    Soroswap,
}

/// A single strategy allocation entry.
///
/// `weight` is expressed in basis points (0–10 000) so that the sum of all
/// active allocations equals 10 000 (100 %).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StrategyAllocation {
    /// Human-readable strategy name (e.g. "blend-usdc-supply")
    pub name: Symbol,
    /// Target protocol
    pub strategy_type: StrategyType,
    /// On-chain contract address of the strategy target
    pub contract_address: Address,
    /// Allocation weight in basis points (sum must equal 10 000)
    pub weight_bps: u32,
    /// Whether this strategy is currently active
    pub active: bool,
}

impl StrategyAllocation {
    /// Returns `true` when the allocation is active and has a non-zero weight.
    pub fn is_active(&self) -> bool {
        self.active && self.weight_bps > 0
    }
}
