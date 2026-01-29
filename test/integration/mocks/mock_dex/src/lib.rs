#![no_std]

//! Mock Decentralized Exchange (DEX) Contract for Testing

use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct MockDEX;

#[contractimpl]
impl MockDEX {
    /// Swap TokenA for TokenB
    pub fn swap(
        _env: Env,
        _user: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> Result<i128, soroban_sdk::Error> {
        if amount_in <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }
        if min_amount_out <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }

        // For testing: 1 XLM = 0.5  USDC (fixed rate, divided by 10 for calculations)
        let amount_out = (amount_in * 5) / 10;

        if amount_out < min_amount_out {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }

        Ok(amount_out)
    }

    /// Add liquidity to the pool
    pub fn add_liquidity(
        _env: Env,
        _provider: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> Result<i128, soroban_sdk::Error> {
        if amount_a <= 0 || amount_b <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }

        // For testing: LP tokens = simple multiplication (mock)
        let lp_tokens = amount_a * amount_b;

        Ok(lp_tokens)
    }

    /// Remove liquidity from the pool
    pub fn remove_liquidity(
        _env: Env,
        _provider: Address,
        lp_tokens: i128,
    ) -> Result<(i128, i128), soroban_sdk::Error> {
        if lp_tokens <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }

        // For testing: proportional amounts (mock)
        let amount_a = lp_tokens * 100;
        let amount_b = lp_tokens * 500;

        Ok((amount_a, amount_b))
    }

    /// Get exchange rate (TokenA -> TokenB)
    pub fn exchange_rate(_env: Env) -> i128 {
        // Return 1 XLM = 0.5 USDC
        5_000
    }

    /// Get pool reserves
    pub fn pool_reserves(_env: Env) -> (i128, i128) {
        // TokenA: 100,000 XLM, TokenB: 500,000 USDC
        (100_000_000_000, 500_000_000_000)
    }

    /// Get liquidity provided
    pub fn liquidity_of(_env: Env, _provider: Address) -> i128 {
        // For testing, return 10,000 LP tokens
        10_000_000_000
    }
}
