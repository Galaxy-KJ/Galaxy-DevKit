# Galaxy Oracle (`galaxy-oracle`)

On-chain price oracle Soroban smart contract for Galaxy DevKit. Serves trusted price feeds and Time-Weighted Average Prices (TWAPs) on-chain for Soroban smart contracts, lending protocols, synthetics, and decentralized exchanges.

## Features

- **Access Control**: Owner-managed pusher registry with strict signature and address authorization.
- **Consumer View Methods**: `get_price(base, quote)` for zero-overhead, real-time price lookups by consumer contracts.
- **Staleness Checks**: `get_price_checked` and `get_price_strict` to prevent stale price vulnerability in financial contracts.
- **TWAP Arithmetic**: Standard and time-windowed (5m, 15m, 1h) TWAP calculation across circular price observations.
- **Gas Efficiency**: $O(1)$ amortized updates using fixed-size circular ring buffers stored in instance storage.

## Interface Overview

```rust
pub trait GalaxyOracleTrait {
    fn initialize(env: &Env, admin: Address);
    fn set_admin(env: &Env, new_admin: Address);
    fn add_pusher(env: &Env, admin: Address, pusher: Address);
    fn remove_pusher(env: &Env, admin: Address, pusher: Address);
    fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128);
    fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry;
    fn get_price_checked(env: &Env, base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceResult;
    fn get_twap(env: &Env, base: Symbol, quote: Symbol) -> i128;
    fn get_twap_5m(env: &Env, base: Symbol, quote: Symbol) -> i128;
}
```

## Running Tests

```bash
cargo test --manifest-path packages/contracts/galaxy-oracle/Cargo.toml
```

## Building WASM

```bash
stellar contract build
```
