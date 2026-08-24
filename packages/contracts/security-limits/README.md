# Security Limits

Soroban risk-management primitive for Galaxy DevKit. Each owner stores their own limits and risk profile in persistent storage. An enforcer address (the automation engine) records fills. History is emitted as events, not an unbounded on-chain vec.

## Initialize

```
initialize(admin, enforcer) -> Result<(), SecurityLimitsError>
```

Call once. Re-initialization returns `AlreadyInitialized`. `admin` must authorize. `enforcer` is the only address allowed to call `record_transaction`. Pass the owner as `enforcer` if the owner should record their own usage.

## Authorization

| Function | Who must sign |
|---|---|
| `create_security_limit` | `owner` |
| `update_security_limit` | `owner` |
| `delete_security_limit` | `owner` |
| `set_risk_profile` | `owner` |
| `record_transaction` | stored `enforcer` |

Reads (`check_transaction_allowed`, `get_security_limits`, `get_risk_profile`, `is_asset_allowed`) need no auth.

## Storage

Instance (shared, small): `Admin`, `Enforcer`, `NextLimitId`, `NextTxId`.

Persistent, keyed by owner:

- `Limits(Address)` — that owner's map of limits
- `Profile(Address)` — that owner's risk profile
- `Usage(Address, Symbol)` — rolling counters; reserved symbol `DAILYVOL` holds 24h profile volume

Reads of owner A never deserialize owner B. Every persistent access and every mutating call extends TTL (~30 day threshold, bump to ~120 days).

## Enforcement

`check_transaction_allowed` is read-only and returns `CheckResult { allowed, reason }` where `reason` is a `SecurityLimitsError` discriminant or `None`.

It rejects when:

- the asset is blacklisted or missing from a non-empty allow list
- `amount > max_single_transaction`
- 24h volume would exceed `max_daily_volume`
- a windowed limit would exceed `max_amount` (usage is computed as 0 if the window has elapsed, but not written)
- a `PerTransaction` limit sees `amount > max_amount` (no cumulative counter)

`record_transaction` re-runs that check, persists the window reset, then `checked_add`s usage. On rejection it emits `limit_breached` and returns the typed error.

## Events

Topics are always `(name, owner, asset)` so indexers can filter per account:

- `limit_created`, `limit_updated`, `limit_deleted`
- `profile_set` (asset topic is the literal `PROFILE`)
- `tx_recorded` — data `(tx_id, amount, hash)`
- `limit_breached` — data `(reason, amount)`

## Errors

| Code | Name |
|---|---|
| 1 | `NotAuthorized` |
| 2 | `LimitNotFound` |
| 3 | `LimitExceeded` |
| 4 | `AssetNotAllowed` |
| 5 | `AlreadyInitialized` |
| 6 | `InvalidAmount` |
| 7 | `Overflow` |

Do not renumber.

## Test and build

From this directory:

```
cargo test
stellar contract build
```

`cargo test -p security-limits` also works if this crate is a workspace member.

This crate pins `ed25519-dalek = 2.2.0` as a dev-dependency because `soroban-env-host` 21.2.1 does not compile against dalek 3.x.
