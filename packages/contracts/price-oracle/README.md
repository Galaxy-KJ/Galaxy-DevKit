# Price Oracle (`price-oracle`)

On-chain price oracle Soroban smart contract for Galaxy DevKit. Serves trusted price feeds and Time-Weighted Average Prices (TWAPs) on-chain for Soroban smart contracts, lending protocols, synthetics, and decentralized exchanges.

## Features

- **Access Control**: Admin-managed pusher registry with strict signature and address authorization.
- **Consumer View Methods**: `get_price(base, quote)` for real-time price lookups by consumer contracts.
- **Staleness Checks**: `get_price_checked` and `get_price_strict` to prevent stale price vulnerabilities in financial contracts.
- **TWAP Arithmetic**: Full-history and time-windowed (`get_twap_window`, plus 5m, 15m and 1h shortcuts) TWAP calculation across circular price observations.
- **Gas Efficiency**: O(1) writes using a fixed-size circular ring buffer per asset pair.

## Storage and TTL

- Each asset pair has its own ring buffer in **persistent** storage, keyed by `PriceDataKey::Price(base, quote)`. Pusher authorization is also stored per pusher in persistent storage (`PriceDataKey::Pusher(address)`).
- Instance storage only holds global configuration and enumeration metadata (admin, pusher list, known pairs).
- Every read or write that touches an entry extends its TTL when it falls below 60,480 ledgers (about 3.5 days), up to 120,960 ledgers (about 7 days). Feeds that are read keep themselves alive.

## Interface Overview

```rust
pub fn initialize(env: &Env, admin: Address);
pub fn get_admin(env: &Env) -> Address;
pub fn set_admin(env: &Env, new_admin: Address);
pub fn add_pusher(env: &Env, admin: Address, pusher: Address);
pub fn remove_pusher(env: &Env, admin: Address, pusher: Address);
pub fn get_pushers(env: &Env) -> Vec<Address>;
pub fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128);
pub fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry;
pub fn get_price_history(env: &Env, base: Symbol, quote: Symbol) -> Vec<PriceEntry>;
pub fn get_price_checked(env: &Env, base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceResult;
pub fn get_price_strict(env: &Env, base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceEntry;
pub fn get_twap(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_window(env: &Env, base: Symbol, quote: Symbol, window_seconds: u64) -> i128;
pub fn get_twap_5m(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_15m(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_1h(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_all_prices(env: &Env) -> Map<(Symbol, Symbol), PriceEntry>;
```

## Running Tests

```bash
cargo test --manifest-path packages/contracts/price-oracle/Cargo.toml
```

## Building WASM

```bash
stellar contract build
```

## Why a single oracle contract

**Context.** The repository used to ship two oracle crates, `galaxy-oracle` and `price-oracle`, with the same public function names but separate implementations, TWAP code and test suites. Fixes to TTL, authorization or TWAP in one did not reach the other, and it was unclear which one the deploy script, docs and the TypeScript `OnChainOracleSource` targeted.

**Decision.** `price-oracle` is the canonical contract and `galaxy-oracle` was removed. `price-oracle` already exposed a superset of the ABI, uses soroban-sdk 21 (versus 20), stores data per pair in persistent storage with TTL management (`galaxy-oracle` used instance storage only, with no TTL), and had the larger test suite. All `galaxy-oracle` test scenarios are covered here.

**Consequences.**

- One contract to audit, deploy and maintain. `scripts/deploy-contracts.sh` deploys `price_oracle`.
- Existing deployments of the old `galaxy-oracle` WASM are not upgraded by this change. Redeploy using `price-oracle`.
- TWAP behaviour difference: when several entries share the same timestamp (no elapsed time to weight), `price-oracle` returns their arithmetic average, while `galaxy-oracle` returned the last price. The averaging behaviour is kept and is covered by `test_twap_same_timestamps_returns_average`.
- The `market_data.source` column default `'galaxy-oracle'` in the Supabase schema is an off-chain data-origin label, not a reference to the crate, and is intentionally unchanged.
