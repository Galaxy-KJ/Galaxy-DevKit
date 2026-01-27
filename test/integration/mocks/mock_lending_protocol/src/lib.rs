#![no_std]

//! Mock Lending Protocol Contract for Testing

use soroban_sdk::{contract, contractimpl, Env, Address};

#[contract]
pub struct MockLendingProtocol;

#[contractimpl]
impl MockLendingProtocol {
    /// Supply tokens to the lending protocol
    pub fn supply(_env: Env, _user: Address, amount: i128) -> Result<i128, soroban_sdk::Error> {
        if amount <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }
        Ok(amount)
    }

    /// Borrow tokens from the lending protocol
    pub fn borrow(_env: Env, _user: Address, amount: i128) -> Result<i128, soroban_sdk::Error> {
        if amount <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }
        Ok(amount)
    }

    /// Repay borrowed tokens
    pub fn repay(_env: Env, _user: Address, amount: i128) -> Result<i128, soroban_sdk::Error> {
        if amount <= 0 {
            return Err(soroban_sdk::Error::from((
                soroban_sdk::xdr::ScErrorType::Contract,
                soroban_sdk::xdr::ScErrorCode::InvalidInput,
            )));
        }
        Ok(0)
    }

    /// Get user's supply balance
    pub fn supply_balance(_env: Env, _user: Address) -> i128 {
        1_000_000_000
    }

    /// Get user's borrow balance
    pub fn borrow_balance(_env: Env, _user: Address) -> i128 {
        0
    }

    /// Get current interest rate (APY)
    pub fn interest_rate(_env: Env) -> i128 {
        500
    }

    /// Get total supplied amount
    pub fn total_supply(_env: Env) -> i128 {
        1_000_000_000_000
    }

    /// Get total borrowed amount
    pub fn total_borrow(_env: Env) -> i128 {
        500_000_000_000
    }

    /// Get user's collateral ratio
    pub fn collateral_ratio(_env: Env, _user: Address) -> i128 {
        1_500
    }
}