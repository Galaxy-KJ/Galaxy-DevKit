#![no_std]
use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct Hello;

#[contractimpl]
impl Hello {
    /// Return a value to expose a minimal contract interface for deployment tests.
    pub fn hello() -> u32 {
        42
    }
}
