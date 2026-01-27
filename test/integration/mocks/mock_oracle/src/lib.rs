#![no_std]

//! Mock Oracle Contract for Testing

use soroban_sdk::{contract, contractimpl, Env, Bytes, Vec};

#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    /// Get price for a trading pair
    pub fn get_price(_env: Env, base: Bytes, quote: Bytes) -> Result<(i128, u64, i128), soroban_sdk::Error> {
        // Validate inputs
        if base.len() == 0 || quote.len() == 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }

        // For testing, return mock prices based on pair
        let (price, confidence) = if base.len() == 3 && quote.len() == 3 {
            (35_000_000, 1_000_000) // XLM/USD
        } else if base.len() == 4 && quote.len() == 3 {
            (1_000_000_000, 100_000) // USDC/USD
        } else {
            (43_000_000_000_000, 100_000_000) // Default: BTC/USD
        };

        Ok((price, 0, confidence))
    }

    /// Get latest price for a trading pair
    pub fn price(_env: Env, base: Bytes, quote: Bytes) -> Result<i128, soroban_sdk::Error> {
        let (price, _, _) = Self::get_price(_env, base, quote)?;
        Ok(price)
    }

    /// Check if price is stale
    pub fn is_stale(
        _env: Env,
        base: Bytes,
        quote: Bytes,
        _max_age: u64,
    ) -> Result<bool, soroban_sdk::Error> {
        let (_, _, _) = Self::get_price(_env, base, quote)?;
        Ok(false) // Mock: never stale
    }

    /// Get price with confidence interval
    pub fn get_price_with_confidence(
        _env: Env,
        base: Bytes,
        quote: Bytes,
    ) -> Result<(i128, i128), soroban_sdk::Error> {
        let (price, _, confidence) = Self::get_price(_env, base, quote)?;
        Ok((price, confidence))
    }

    /// Update price (for testing/admin)
    pub fn update_price(
        _env: Env,
        _base: Bytes,
        _quote: Bytes,
        price: i128,
    ) -> Result<(), soroban_sdk::Error> {
        if price <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }
        Ok(())
    }

    /// Get supported trading pairs
    pub fn supported_bases(env: Env) -> Vec<Bytes> {
        let mut bases = Vec::new(&env);
        bases.push_back(Bytes::from_slice(&env, b"XLM"));
        bases.push_back(Bytes::from_slice(&env, b"USDC"));
        bases.push_back(Bytes::from_slice(&env, b"BTC"));
        bases.push_back(Bytes::from_slice(&env, b"ETH"));
        bases
    }
}