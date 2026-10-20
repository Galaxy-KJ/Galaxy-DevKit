use soroban_sdk::contracterror;

/// Values are stable: do not renumber without a migration plan.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SwapError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    ConditionNotFound = 3,
    ConditionNotActive = 4,
    ConditionNotMet = 5,
    /// The oracle price is older than `max_price_age_secs`.
    PriceStale = 6,
    /// The oracle returned a price `<= 0`, or price math overflowed.
    InvalidPrice = 7,
    /// The swap delivered less than `max(min_amount_out, slippage floor)`.
    InsufficientOutput = 8,
    InvalidAmount = 9,
    Unauthorized = 10,
    /// `source_token` and `destination_token` are the same contract.
    InvalidTokenPair = 11,
}
