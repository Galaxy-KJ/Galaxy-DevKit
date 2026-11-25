# Vesting

Soroban contract for token vesting with a cliff and linear release.

A funder deposits tokens for a beneficiary when the schedule is created. The beneficiary claims what has vested over time. The admin can revoke a schedule: the beneficiary keeps what has vested, and the rest goes back to the funder.

Works with any SEP-41 token, including Stellar Asset Contracts.

## Deploy and initialize

```
initialize(admin, token)
```

Call once, signed by `admin`. A second call fails with `AlreadyInitialized`.

- `admin`: the only address that can revoke schedules.
- `token`: the SEP-41 token or Stellar Asset Contract this instance vests. One token per deployment.

Deploy and `initialize` are separate transactions, because soroban-sdk 21 has no constructor. Until `initialize` lands, anyone can call it with their own admin and token, so run the two back to back and check `get_admin` afterwards.

The soroban-sdk 21 VM rejects wasm that uses the `reference-types` feature, which Rust 1.82 and later enable by default for `wasm32-unknown-unknown` (the contract fails to load with "reference-types not enabled"). Build with Rust 1.81. Current releases of some dependencies need a newer compiler, so resolve the lockfile for 1.81 first (`ethnum` does not declare its minimum Rust version, hence the manual pin). The lockfile step needs Cargo 1.84 or later, since older Cargo ignores `CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS`, so it runs on `stable`:

```bash
rustup toolchain install stable
rustup toolchain install 1.81.0 --target wasm32-unknown-unknown
CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback \
  RUSTC="$(rustup which --toolchain 1.81.0 rustc)" cargo +stable generate-lockfile
cargo update -p ethnum --precise 1.5.0
cargo +1.81.0 build --target wasm32-unknown-unknown --release
stellar contract optimize --wasm target/wasm32-unknown-unknown/release/vesting.wasm

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/vesting.optimized.wasm \
  --source admin --network testnet
# -> CONTRACT_ID

stellar contract invoke --id CONTRACT_ID --source admin --network testnet -- \
  initialize --admin ADMIN_ADDRESS --token TOKEN_ID
```

## Interface

| Function | Signed by | Notes |
|---|---|---|
| `initialize(admin, token)` | `admin` | once |
| `create_schedule(funder, beneficiary, total_amount, start, cliff, duration)` | `funder` | transfers `total_amount` from `funder` into the contract |
| `claim_tokens(beneficiary) -> i128` | `beneficiary` | sends everything vested and unclaimed, returns the amount |
| `revoke_schedule(beneficiary) -> (i128, i128)` | admin | returns `(still_claimable_by_beneficiary, refund_to_funder)`; the refund is sent, or held for `withdraw_refund` |
| `withdraw_refund(funder) -> i128` | `funder` | only needed if a revoke refund could not be sent |
| `get_vested_amount(beneficiary) -> i128` | | vested so far, claimed or not |
| `get_claimed_amount(beneficiary) -> i128` | | `0` if there is no schedule |
| `get_schedule(beneficiary) -> Option<VestingSchedule>` | | |
| `get_refund(funder) -> i128` | | deferred refund, usually `0` |
| `get_admin() -> Address`, `get_token() -> Address` | | |

`VestingSchedule { funder, beneficiary, total_amount, claimed, start, cliff, duration, revoked }`. Amounts are `i128` token base units, times are ledger timestamps in seconds.

Example: vest 1,000 tokens (7 decimals) over one year with a 90-day cliff, starting at `1767225600`:

```bash
stellar contract invoke --id CONTRACT_ID --source funder --network testnet -- \
  create_schedule --funder FUNDER_ADDRESS --beneficiary BENEFICIARY_ADDRESS \
  --total_amount 10000000000 --start 1767225600 --cliff 7776000 --duration 31536000

stellar contract invoke --id CONTRACT_ID --source beneficiary --network testnet -- \
  claim_tokens --beneficiary BENEFICIARY_ADDRESS
```

## Vesting rules

- `vested = total_amount * (now - start) / duration`, rounded down, capped at `total_amount` once `now >= start + duration`.
- Before `start + cliff` nothing is vested. At the cliff, everything vested since `start` unlocks at once.
- `start` can be in the past (a backdated grant) or the future.
- The math is exact for every `i128` amount and `u64` duration: `total_amount` is split into `q * duration + r` so no intermediate product overflows.
- Each beneficiary has one open schedule. Once a schedule is fully claimed (or revoked with nothing left to claim) a new one can be created for the same beneficiary. The new schedule starts with `claimed = 0`; past claims stay visible in the events.

Validation on `create_schedule`: `total_amount > 0`, `duration > 0`, `cliff <= duration`, `start + duration` fits in a `u64`, and the beneficiary is not the contract itself.

## Revoking

`revoke_schedule` freezes the schedule at the current time:

- What has vested stays claimable by the beneficiary through `claim_tokens`, however late they claim. Nothing more vests.
- The unvested rest is sent back to the funder in the same call.
- If that refund transfer fails (for example the funder removed their trustline or their balance is deauthorized), the revoke still succeeds and the amount is kept for the funder to collect later with `withdraw_refund`.

Revoke never sends tokens to the beneficiary, so a beneficiary who cannot receive tokens cannot block it. If nothing is left to claim, the schedule is deleted right away. This is also how the admin clears a schedule that someone else funded for a beneficiary's address to occupy it.

## Errors

| Code | Name | When |
|---|---|---|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `NotInitialized` | any call that needs the admin or token before `initialize` |
| 3 | `InvalidAmount` | `total_amount <= 0` |
| 4 | `InvalidDuration` | `duration == 0` |
| 5 | `CliffExceedsDuration` | `cliff > duration` |
| 6 | `TimeOverflow` | `start + duration` overflows `u64` |
| 7 | `ScheduleExists` | the beneficiary has a schedule that is not fully claimed |
| 8 | `ScheduleNotFound` | no schedule for the beneficiary |
| 9 | `CliffNotReached` | claim before `start + cliff` |
| 10 | `NothingToClaim` | nothing new has vested |
| 11 | `MathOverflow` | defensive guard, unreachable for valid schedules |
| 12 | `InvalidBeneficiary` | the beneficiary is the vesting contract |
| 13 | `AlreadyRevoked` | revoke on a revoked schedule |
| 14 | `NothingToWithdraw` | `withdraw_refund` with no deferred refund |

## Events

| Topics | Data |
|---|---|
| `("init")` | `(admin, token)` |
| `("created", beneficiary)` | `(funder, total_amount, start, cliff, duration)` |
| `("claimed", beneficiary)` | `amount` |
| `("revoked", beneficiary)` | `(still_claimable_by_beneficiary, refund_to_funder)`, refund sent or held |
| `("refunddue", funder)` | `amount`, when a revoke refund was deferred |
| `("refunded", funder)` | `amount`, on `withdraw_refund` |

## Storage

- Instance: `Admin`, `Token`.
- Persistent: one `Schedule(beneficiary)` entry per beneficiary and one `Refund(funder)` entry per funder with a deferred refund.

Every call that touches an entry extends its TTL to about 120 days once less than about 30 days remain (`PERSISTENT_TTL_*`). Any call that touches a schedule or refund also tops the instance up to the full window, so the contract never expires before the entries it holds. An entry that does expire is archived, not lost, and can be restored.

## Token notes

- On a classic Stellar asset, a beneficiary with a `G...` address needs a trustline (and authorization, if the asset requires it) before claiming.
- Fee-on-transfer or rebasing tokens are not supported.
- If the issuer claws back tokens held by this contract, claims can fail for lack of balance.

## Tests

```bash
cd packages/contracts/vesting
cargo test
```

`Cargo.lock` is not committed. If a fresh resolve picks `ed25519-dalek 3.x`, `soroban-env-host 21.2.1` fails to compile; pin it back with:

```bash
cargo update -p ed25519-dalek@3.0.0 --precise 2.2.0
```
