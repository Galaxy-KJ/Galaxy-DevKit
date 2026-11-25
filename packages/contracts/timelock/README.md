# Timelock

Soroban contract that delays contract calls.

The admin queues a call (`target`, `fn_name`, `args`) with an `eta` at least `min_delay` seconds in the future. From `eta` to `eta + grace_period`, the admin can execute it. The timelock then invokes `target.fn_name(args)` itself, so a target that trusts the timelock (for example one whose admin is the timelock address) accepts the call. The admin can cancel a queued call at any time before it runs.

The admin can be an account or a contract, such as the governance contract.

## Deploy and initialize

```
initialize(admin, min_delay, grace_period)
```

Call once, signed by `admin`. A second call fails with `AlreadyInitialized`.

- `admin`: the only address that can queue, execute and cancel.
- `min_delay`: minimum seconds between queueing and `eta`. Must be `1..=MAXIMUM_DELAY` (30 days).
- `grace_period`: seconds after `eta` during which the call can still run. Must be `1..=MAXIMUM_GRACE_PERIOD` (30 days).

Deploy and `initialize` are separate transactions, because soroban-sdk 21 has no constructor. Until `initialize` lands, anyone can call it with their own admin, so run the two back to back and check `get_admin` afterwards.

To build the wasm, follow the toolchain steps in [`../vesting/README.md`](../vesting/README.md#deploy-and-initialize), using `timelock.wasm` instead of `vesting.wasm`.

## Interface

| Function | Auth | Description |
| --- | --- | --- |
| `queue_transaction(target, fn_name, args, eta) -> BytesN<32>` | admin | Queues the call and returns its hash. Requires `now + min_delay <= eta <= now + MAXIMUM_DELAY`. |
| `execute_transaction(tx_hash) -> Val` | admin | Runs the call if `eta <= now <= eta + grace_period`, and returns what the target returned. |
| `revoke_transaction(tx_hash)` | admin | Cancels a queued call. |
| `get_queued_transaction(tx_hash) -> Option<QueuedTransaction>` | none | The queued call, or `None` if it was never queued, or was executed or cancelled. |
| `is_executed(tx_hash) -> bool` | none | Whether the call was executed. |
| `hash_transaction(target, fn_name, args, eta) -> BytesN<32>` | none | The hash `queue_transaction` returns for these values. |
| `get_admin`, `get_min_delay`, `get_grace_period` | none | The configuration. |

The hash is `sha256(xdr((target, fn_name, args, eta)))`. Queueing the same call with a different `eta` gives a different hash.

If the target call fails, the whole `execute_transaction` invocation is rolled back. The call stays queued and can be retried until it expires.

## Events

| Topics | Data |
| --- | --- |
| `("init",)` | `(admin, min_delay, grace_period)` |
| `("queued", tx_hash)` | `(target, fn_name, args, eta)` |
| `("executed", tx_hash)` | `(target, fn_name)` |
| `("cancelled", tx_hash)` | `(target, fn_name)` |

## Errors

| Code | Error | When |
| --- | --- | --- |
| 1 | `AlreadyInitialized` | `initialize` was already called. |
| 2 | `NotInitialized` | A call ran before `initialize`. |
| 3 | `InvalidDelay` | `min_delay` is 0 or above `MAXIMUM_DELAY`. |
| 4 | `InvalidGracePeriod` | `grace_period` is 0 or above `MAXIMUM_GRACE_PERIOD`. |
| 5 | `EtaTooEarly` | `eta < now + min_delay`. |
| 6 | `EtaTooLate` | `eta > now + MAXIMUM_DELAY`. |
| 7 | `AlreadyQueued` | The same call and `eta` are already queued. |
| 8 | `NotQueued` | No queued call has this hash. |
| 9 | `AlreadyExecuted` | The call was already executed. |
| 10 | `NotReady` | `now < eta`. |
| 11 | `Expired` | `now > eta + grace_period`. |
| 12 | `TimeOverflow` | A time computation overflowed `u64`. |

## Storage

`Admin`, `MinDelay` and `GracePeriod` are in instance storage. Each queued call (`Queued(hash)`) and each executed marker (`Executed(hash)`) is its own persistent entry, extended to about 120 days whenever it is touched. That is longer than the 60-day maximum between queueing and the end of the grace period, so an untouched queued call does not expire before it can run.
