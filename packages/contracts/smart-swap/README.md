# Smart Swap

Soroban contract for conditional swaps. An owner deposits source tokens with a price condition. When the condition holds, anyone (a keeper) can execute it. The contract reads the price from an oracle, swaps through a Soroswap-compatible router and sends the output to the owner.

## Deploy and initialize

```
initialize(admin, oracle, router, max_price_age_secs: u64, target_tolerance_bps: u32)
```

Call once, signed by `admin`. A second call fails with `AlreadyInitialized`. Out-of-range values fail with `InvalidConfig`.

- `oracle`: a contract with `get_price_checked(base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceResult`, such as `price-oracle` or `galaxy-oracle`.
- `router`: a Soroswap-compatible router (see [Router](#router)).
- `max_price_age_secs`: must be `> 0`. Oracle prices older than this are rejected with `PriceStale`.
- `target_tolerance_bps`: must be `<= 10_000`. It sets the width of the `TargetPrice` band.

Deploy and `initialize` are separate transactions, because soroban-sdk 21 has no constructor. Until `initialize` lands, anyone can call it with their own admin, oracle and router. Run the two back to back.

`scripts/deploy-contracts.sh` followed by `scripts/init-contracts.sh` does this:

- The init script calls `initialize` when `SMART_SWAP_ROUTER_ID` is set. The oracle defaults to the `galaxy_oracle` from the manifest, and the admin to the deployer's address.
- It then reads `get_config` and exits non-zero unless the stored admin is the expected one.
- The other variables are documented in the script's header.

## ABI

| Function | Signed by | Notes |
|---|---|---|
| `initialize(admin, oracle, router, max_price_age_secs, target_tolerance_bps)` | `admin` | once |
| `set_config(oracle, router, max_price_age_secs, target_tolerance_bps)` | stored admin | affects new conditions only, see below |
| `get_config() -> Config` | | |
| `create_swap_condition(owner, source_asset, destination_asset, source_token, destination_token, condition_type, amount_to_swap, min_amount_out, max_slippage, expires_at) -> u64` | `owner` | deposits `amount_to_swap` |
| `execute_swap_condition(condition_id) -> Option<SwapExecution>` | nobody | `None`: expired and refunded |
| `cancel_condition(condition_id, owner)` | `owner` | refunds the deposit |
| `get_condition(condition_id) -> SwapCondition` | | |
| `get_active_conditions(owner) -> Vec<SwapCondition>` | | only that owner's active conditions |
| `get_execution_history(condition_id) -> Vec<SwapExecution>` | | 0 or 1 entries |

`Config { admin, oracle, router, max_price_age_secs, target_tolerance_bps }`.

`SwapCondition` fields:

- `id`, `owner`
- `source_asset`, `destination_asset`: `Symbol`s, the oracle pair (base, quote).
- `source_token`, `destination_token`: SEP-41 tokens or Stellar Asset Contracts.
- `oracle`, `router`, `max_price_age_secs`, `target_tolerance_bps`: copied from the config at creation.
- `condition_type`, `amount_to_swap`, `min_amount_out`
- `max_slippage`: basis points, `0..=10_000`.
- `reference_price`: the oracle price at creation.
- `created_at`, `expires_at`, `status`: `Active`, `Executed`, `Expired` or `Cancelled`.

`SwapExecution { condition_id, executed_at, actual_amount_out, price_at_execution, ledger_sequence }`.

## Prices and amounts

The oracle price is the value of one unit of `source_token` in `destination_token`, scaled by `PRICE_SCALE = 1_000_000`. Amounts are `i128` token base units.

`expected_out = amount_to_swap * price / PRICE_SCALE` assumes both tokens use the same number of decimals, as Stellar classic assets do (7). For tokens with different decimals, the oracle price must already be expressed in base units, or the slippage floor will be wrong.

A price is rejected with `PriceStale` in any of these cases:

- the oracle flags it as stale;
- its timestamp is in the future;
- it is more than `max_price_age_secs` old.

A price `<= 0` is rejected with `InvalidPrice`. Overflow in any price or amount math is also `InvalidPrice`.

## Conditions

| Condition | Met when |
|---|---|
| `PriceAbove(p)` | `price > p` |
| `PriceBelow(p)` | `price < p` |
| `TargetPrice(p)` | `abs(price - p) * 10_000 <= p * target_tolerance_bps` (inclusive; requires `p > 0`) |
| `PercentageIncrease(n)` | `price >= reference + reference * n / 100` |
| `PercentageDecrease(n)` | `price <= reference - reference * n / 100`; `n` must be `< 100` |

`expires_at` must satisfy `now < expires_at <= now + MAX_CONDITION_DURATION_SECS`, where the maximum is 365 days. Otherwise creation fails with `InvalidExpiry`.

A condition can still execute at exactly `expires_at`. It expires only when `now > expires_at`.

## Execution

1. If `now > expires_at`, the deposit goes back to the owner, the condition becomes `Expired`, and the call returns `None`. The oracle is not consulted.
2. The price must be fresh and positive, and the condition must hold (`ConditionNotMet`).
3. `slippage_floor = expected_out * (10_000 - max_slippage) / 10_000`, and `amount_out_min = max(min_amount_out, slippage_floor)`.
4. The condition's router swaps `amount_to_swap` with `amount_out_min`. The real output is the contract's destination-token balance delta, not the router's return value. Below `amount_out_min` the call fails with `InsufficientOutput`, and nothing changes.
5. The output goes to the stored `owner`, whoever called. The condition becomes `Executed`, and its `SwapExecution` is stored.

`max_slippage = 10_000` together with `min_amount_out = 0` accepts any output. Only use it on purpose.

## Router

The contract calls these two router functions, with the Soroswap router signatures:

```
router_pair_for(token_a: Address, token_b: Address) -> Address
swap_exact_tokens_for_tokens(amount_in: i128, amount_out_min: i128, path: Vec<Address>,
                             to: Address, deadline: u64) -> Vec<i128>
```

The Soroswap router calls `to.require_auth()` and then itself transfers `amount_in` from `to` to the pair. The deposit is held by this contract, so the contract passes itself as `to`.

Before the call, the contract uses `authorize_as_current_contract` to authorize exactly one `transfer(this contract, pair, amount_to_swap)` on the source token, where `pair` comes from `router_pair_for`. The router cannot move more than that, and it cannot touch other conditions' deposits. The deadline is `now + 300`.

## Trust assumptions

- **The config is pinned per condition.** The oracle, the router, `max_price_age_secs` and `target_tolerance_bps` are copied from the config when the condition is created, so the owner agrees to them by signing `create_swap_condition`. A later `set_config` cannot change how an existing deposit is priced or where it is swapped.
- **The owner's account must be able to receive and refund.** On the destination token, the owner needs a trustline (classic assets) or authorization (auth-required SACs), or execution fails. On the source token, the owner must not be frozen or deauthorized, or cancel and expiry refunds fail. Either way the deposit stays in the contract, and it can be recovered once the owner's account is fixed.

## Events

Topics are `(name, owner)`.

| Name | Data |
|---|---|
| `created` | `(condition_id, source_token, destination_token, amount_to_swap, expires_at)` |
| `executed` | `(condition_id, amount_in, amount_out, price)` |
| `cancelled` | `(condition_id, refunded_amount)` |
| `expired` | `(condition_id, refunded_amount)` |

## Storage

- **Instance:** `CONFIG` and `NEXT_ID` only. It does not grow with the number of conditions.
- **Persistent:**
  - `DataKey::Condition(id)` holds one condition.
  - `DataKey::Execution(id)` holds that condition's execution.
  - `DataKey::OwnerConditions(owner)` holds that owner's active ids. It is pruned on execute, cancel and expiry, and removed when it is empty.

Each call reads and writes only the entries it acts on, and extends their TTL. The TTL threshold is ~3.5 days and the extension is ~7 days. A condition left untouched for longer is archived, not deleted, and can be restored before use.

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
| 12 | `InvalidExpiry` |
| 13 | `InvalidConfig` |

## Tests

```
cargo test
```

The tests use a mock oracle and a mock router that charges `amount_in` the way the Soroswap router does. Execution tests run with real auth enforcement and no signatures, as a keeper would.
