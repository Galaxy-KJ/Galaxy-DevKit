# Smart Swap

Soroban contract for conditional swaps. An owner deposits source tokens with a price condition. When the condition holds, anyone (a keeper) can execute it. The contract reads the price from the configured oracle, swaps through a Soroswap-compatible router and sends the output to the owner.

## Initialize

```
initialize(admin, oracle, router, max_price_age_secs: u64, target_tolerance_bps: u32)
```

Call once, signed by `admin`. A second call fails with `AlreadyInitialized`.

- `oracle`: a contract with `get_price_checked(base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceResult`, such as `price-oracle` or `galaxy-oracle`.
- `router`: a Soroswap-compatible router (see [Router](#router)).
- `max_price_age_secs`: oracle prices older than this are rejected with `PriceStale`.
- `target_tolerance_bps`: width of the `TargetPrice` band.

`set_config(oracle, router, max_price_age_secs, target_tolerance_bps)` replaces these values and must be signed by the stored admin. `get_config()` returns them.

`scripts/init-contracts.sh` calls `initialize` when `SMART_SWAP_ROUTER_ID` is set. See the header of that script for the other variables.

## Conditions

```
create_swap_condition(owner, source_asset: Symbol, destination_asset: Symbol,
                      source_token: Address, destination_token: Address,
                      condition_type, amount_to_swap: i128, min_amount_out: i128,
                      max_slippage: u32, expires_at: u64) -> u64
```

- `source_asset` and `destination_asset` are the oracle pair (base, quote). The price is the value of one unit of `source_token` in `destination_token`, scaled by `PRICE_SCALE = 1_000_000`.
- `source_token` and `destination_token` are SEP-41 tokens or Stellar Asset Contracts.
- `amount_to_swap` moves from `owner` to the contract at creation.
- `reference_price` is the oracle price at creation.
- `max_slippage` is in basis points (`0..=10_000`).

| Condition | Met when |
|---|---|
| `PriceAbove(p)` | `price > p` |
| `PriceBelow(p)` | `price < p` |
| `TargetPrice(p)` | `abs(price - p) * 10_000 <= p * target_tolerance_bps` |
| `PercentageIncrease(n)` | `price >= reference + reference * n / 100` |
| `PercentageDecrease(n)` | `price <= reference - reference * n / 100` (`n <= 100`) |

## Execution

```
execute_swap_condition(condition_id) -> Option<SwapExecution>
```

Needs no signature. The output always goes to the stored `owner`, whoever calls.

1. If `now > expires_at`, the deposit goes back to the owner, the condition becomes `Expired`, and the call returns `None`.
2. The oracle price must be fresh (`PriceStale`) and positive (`InvalidPrice`). The condition must hold (`ConditionNotMet`).
3. `expected_out = amount_to_swap * price / PRICE_SCALE`, `slippage_floor = expected_out * (10_000 - max_slippage) / 10_000`, and `amount_out_min = max(min_amount_out, slippage_floor)`.
4. The router swaps `amount_to_swap` with `amount_out_min`. The real output is the contract's destination-token balance delta, not the router's return value. Below `amount_out_min` the call fails with `InsufficientOutput`.
5. The output is transferred to the owner. The condition becomes `Executed`, and a `SwapExecution { condition_id, executed_at, actual_amount_out, price_at_execution, ledger_sequence }` is recorded.

`cancel_condition(condition_id, owner)` must be signed by the owner and refunds the deposit.

Reads: `get_condition`, `get_active_conditions(owner)`, `get_execution_history(condition_id)`.

## Router

The contract calls these two router functions, with the Soroswap router signatures:

```
router_pair_for(token_a: Address, token_b: Address) -> Address
swap_exact_tokens_for_tokens(amount_in: i128, amount_out_min: i128, path: Vec<Address>,
                             to: Address, deadline: u64) -> Vec<i128>
```

The Soroswap router calls `to.require_auth()` and then itself transfers `amount_in` from `to` to the pair. The deposit is held by this contract, so the contract passes itself as `to`. Before the call it uses `authorize_as_current_contract` to authorize exactly one `transfer(this contract, pair, amount_to_swap)` on the source token, where `pair` comes from `router_pair_for`. The router cannot move more than that, and it cannot touch other conditions' deposits. The router has `deadline = now + 300`.

## Authorization

| Function | Who must sign |
|---|---|
| `initialize` | `admin` |
| `set_config` | stored admin |
| `create_swap_condition` | `owner` (also covers the deposit transfer) |
| `cancel_condition` | `owner` |
| `execute_swap_condition` | nobody |

## Errors

| Code | Error |
|---|---|
| 1 | `NotInitialized` |
| 2 | `AlreadyInitialized` |
| 3 | `ConditionNotFound` |
| 4 | `ConditionNotActive` |
| 5 | `ConditionNotMet` |
| 6 | `PriceStale` |
| 7 | `InvalidPrice` |
| 8 | `InsufficientOutput` |
| 9 | `InvalidAmount` |
| 10 | `Unauthorized` |
| 11 | `InvalidTokenPair` |

## Storage

Everything lives in instance storage: `CONFIG`, `SWAP_COND` (map of conditions), `SWAP_EXEC` (execution list) and `NEXT_ID`. Every call except a failing one extends the instance TTL (threshold ~3.5 days, extend to ~7 days).

## Tests

```
cargo test
```

The tests use a mock oracle and a mock router that charges `amount_in` the way the Soroswap router does. Execution tests run with real auth enforcement and no signatures, as a keeper would.
