use soroban_sdk::{contracttype, Address, Symbol};

/// Set once by `initialize`, changed only by the admin through `set_config`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    /// Contract exposing `get_price_checked` (`price-oracle`, `galaxy-oracle`).
    pub oracle: Address,
    /// Soroswap-compatible router.
    pub router: Address,
    /// Oracle prices older than this are rejected.
    pub max_price_age_secs: u64,
    /// Width of the `TargetPrice` band, in basis points of the target.
    pub target_tolerance_bps: u32,
}

/// Prices are oracle prices of `source_asset` quoted in `destination_asset`,
/// scaled by `PRICE_SCALE`. Amounts are in token base units.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SwapCondition {
    pub id: u64,
    pub owner: Address,
    /// Oracle base symbol.
    pub source_asset: Symbol,
    /// Oracle quote symbol.
    pub destination_asset: Symbol,
    /// SEP-41 token (or SAC) held in custody until execution.
    pub source_token: Address,
    /// SEP-41 token (or SAC) paid to `owner` on execution.
    pub destination_token: Address,
    /// Oracle from the config at creation. `set_config` does not change it.
    pub oracle: Address,
    /// Router from the config at creation. `set_config` does not change it.
    pub router: Address,
    /// `max_price_age_secs` from the config at creation.
    pub max_price_age_secs: u64,
    /// `target_tolerance_bps` from the config at creation.
    pub target_tolerance_bps: u32,
    pub condition_type: SwapConditionType,
    pub amount_to_swap: i128,
    pub min_amount_out: i128,
    /// Basis points below the oracle-implied output that are still accepted.
    pub max_slippage: u32,
    /// Oracle price when the condition was created.
    pub reference_price: i128,
    pub created_at: u64,
    pub expires_at: u64,
    pub status: SwapStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SwapConditionType {
    /// Price rose at least this many percent above `reference_price`.
    PercentageIncrease(u32),
    /// Price fell at least this many percent below `reference_price`.
    PercentageDecrease(u32),
    /// Price within `target_tolerance_bps` of the target.
    TargetPrice(i128),
    PriceAbove(i128),
    PriceBelow(i128),
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
    /// Destination tokens actually received and forwarded to the owner.
    pub actual_amount_out: i128,
    pub price_at_execution: i128,
    pub ledger_sequence: u32,
}

/// Persistent keys. Each call touches only the entries of the condition it
/// acts on, so no single entry grows with the number of conditions.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Condition(u64),
    /// At most one execution per condition.
    Execution(u64),
    /// Ids of the owner's `Active` conditions.
    OwnerConditions(Address),
}
