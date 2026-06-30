//! Flash Loan Soroban Contract for Galaxy DevKit
//!
//! Allows borrowing any amount of assets from the pool within a single
//! transaction without collateral. The contract:
//!   1. Records the pool's token balance before the loan.
//!   2. Transfers `amount` tokens to the receiver contract.
//!   3. Invokes `FlashLoanReceiver::execute` on the receiver, passing the
//!      loan parameters so the receiver can perform its arbitrage / liquidation
//!      logic and arrange repayment.
//!   4. Asserts that the pool's balance has been restored to at least
//!      `pre_balance + fee`, where `fee = ceil(amount * FEE_BPS / 10_000)`.
//!      The transaction reverts if the invariant is not satisfied.
//!
//! ### Fee
//! The default fee is 9 bps (0.09 %).  The admin can update it at any time.
//!
//! ### Receiver interface
//! The receiver contract must expose:
//! ```
//! fn execute(env: Env, token: Address, amount: i128, fee: i128, data: Bytes);
//! ```
//! Inside `execute` the receiver must ensure that `amount + fee` tokens are
//! transferred back to the flash-loan contract before `execute` returns.

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Bytes, Env, IntoVal,
    Symbol,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default loan fee in basis points (9 bps = 0.09 %).
pub const DEFAULT_FEE_BPS: i128 = 9;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN");
const FEE_BPS: Symbol = symbol_short!("FEE_BPS");

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

/// Snapshot returned by `get_pool_info`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolInfo {
    pub admin: Address,
    pub token: Address,
    pub fee_bps: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct FlashLoanContract;

#[contractimpl]
impl FlashLoanContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /// Initialise the flash-loan pool.
    ///
    /// * `admin` – address that can update the fee and withdraw liquidity.
    /// * `token` – the Stellar/Soroban token contract address that the pool
    ///             lends out.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        let storage = env.storage().instance();
        if storage.has(&ADMIN) {
            panic!("already initialized");
        }
        storage.set(&ADMIN, &admin);
        storage.set(&TOKEN, &token);
        storage.set(&FEE_BPS, &DEFAULT_FEE_BPS);
    }

    // -----------------------------------------------------------------------
    // Core flash-loan
    // -----------------------------------------------------------------------

    /// Execute a flash loan.
    ///
    /// * `receiver` – contract that implements the flash-loan receiver
    ///                interface (`execute`).
    /// * `token`    – must match the pool's configured token.
    /// * `amount`   – number of tokens to borrow (must be > 0).
    /// * `data`     – arbitrary bytes forwarded to the receiver's `execute`.
    ///
    /// # Panics
    /// - `amount` is zero or negative.
    /// - `token` does not match the pool token.
    /// - The receiver does not return `amount + fee` tokens by the end of the
    ///   call (transaction reverts).
    pub fn flash_loan(env: Env, receiver: Address, token: Address, amount: i128, data: Bytes) {
        if amount <= 0 {
            panic!("amount must be > 0");
        }

        let storage = env.storage().instance();
        let pool_token: Address = storage.get(&TOKEN).unwrap();

        if token != pool_token {
            panic!("token mismatch");
        }

        let fee_bps: i128 = storage.get(&FEE_BPS).unwrap_or(DEFAULT_FEE_BPS);

        // fee = ceil(amount * fee_bps / 10_000)
        let fee = Self::compute_fee(amount, fee_bps);

        let contract_address = env.current_contract_address();
        let token_client = token::Client::new(&env, &token);

        // Record pre-loan balance
        let pre_balance = token_client.balance(&contract_address);

        // Transfer loan amount to receiver
        token_client.transfer(&contract_address, &receiver, &amount);

        // Invoke receiver callback — receiver must arrange repayment inside.
        // Signature expected on receiver: execute(token, amount, fee, data)
        let _: soroban_sdk::Val = env.invoke_contract(
            &receiver,
            &symbol_short!("execute"),
            (token.clone(), amount, fee, data).into_val(&env),
        );

        // Assert repayment invariant: balance must be >= pre_balance + fee
        let post_balance = token_client.balance(&contract_address);
        let required = pre_balance
            .checked_add(fee)
            .expect("balance overflow");

        if post_balance < required {
            panic!("flash loan not repaid");
        }
    }

    // -----------------------------------------------------------------------
    // Liquidity management (admin only)
    // -----------------------------------------------------------------------

    /// Deposit tokens into the pool to make them available for lending.
    ///
    /// Any address can provide liquidity; auth is required from the depositor.
    pub fn deposit(env: Env, depositor: Address, amount: i128) {
        depositor.require_auth();
        if amount <= 0 {
            panic!("amount must be > 0");
        }

        let storage = env.storage().instance();
        let token: Address = storage.get(&TOKEN).unwrap();
        let contract_address = env.current_contract_address();

        token::Client::new(&env, &token).transfer(&depositor, &contract_address, &amount);
    }

    /// Withdraw tokens from the pool.  Only callable by the admin.
    pub fn withdraw(env: Env, amount: i128) {
        if amount <= 0 {
            panic!("amount must be > 0");
        }

        let storage = env.storage().instance();
        let admin: Address = storage.get(&ADMIN).unwrap();
        admin.require_auth();

        let token: Address = storage.get(&TOKEN).unwrap();
        let contract_address = env.current_contract_address();

        token::Client::new(&env, &token).transfer(&contract_address, &admin, &amount);
    }

    // -----------------------------------------------------------------------
    // Admin – fee management
    // -----------------------------------------------------------------------

    /// Update the loan fee. Only callable by the admin.
    ///
    /// * `fee_bps` – new fee in basis points (0–10 000).
    pub fn set_fee(env: Env, fee_bps: i128) {
        if fee_bps < 0 || fee_bps > 10_000 {
            panic!("fee_bps must be between 0 and 10000");
        }

        let storage = env.storage().instance();
        let admin: Address = storage.get(&ADMIN).unwrap();
        admin.require_auth();

        storage.set(&FEE_BPS, &fee_bps);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// Return pool configuration.
    pub fn get_pool_info(env: Env) -> PoolInfo {
        let storage = env.storage().instance();
        PoolInfo {
            admin: storage.get(&ADMIN).unwrap(),
            token: storage.get(&TOKEN).unwrap(),
            fee_bps: storage.get(&FEE_BPS).unwrap_or(DEFAULT_FEE_BPS),
        }
    }

    /// Compute the fee that would be charged for borrowing `amount` tokens.
    pub fn get_fee(env: Env, amount: i128) -> i128 {
        let fee_bps: i128 = env
            .storage()
            .instance()
            .get(&FEE_BPS)
            .unwrap_or(DEFAULT_FEE_BPS);
        Self::compute_fee(amount, fee_bps)
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// `fee = ceil(amount * fee_bps / 10_000)`
    fn compute_fee(amount: i128, fee_bps: i128) -> i128 {
        if fee_bps == 0 {
            return 0;
        }
        let numerator = amount.checked_mul(fee_bps).expect("fee overflow");
        // ceiling division: (a + b - 1) / b
        numerator
            .checked_add(9_999)
            .expect("fee overflow")
            .checked_div(10_000)
            .expect("fee div by zero")
    }
}

#[cfg(test)]
mod test;
