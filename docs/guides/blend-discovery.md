# Blend pool configuration and liquidation discovery

```typescript
import { BlendProtocol, BLEND_TESTNET_CONFIG } from '@galaxy-kj/core-defi-protocols';

const blend = new BlendProtocol({
  ...BLEND_TESTNET_CONFIG,
  poolConfigTtlMs: 60_000,
  eventLookbackLedgers: 17_280,
  // Optional: indexerUrl: 'https://your-indexer.example',
});
await blend.initialize();
const config = await blend.getPoolConfig();
const opportunities = await blend.findLiquidationOpportunities(1.0);
```

Use a currently deployed V2 pool for the selected network. Testnet resets can
invalidate the bundled address. Initialization requires readable pool and token
metadata; failures reject initialization and can be retried.

The Blend SDK reads the on-chain pool configuration, reserve list, and reserve
configuration/data. Token metadata supplies asset symbols and Stellar issuers.
Custom contract tokens use their contract address as the issuer in the existing
`Asset` representation. The on-chain oracle overrides the static config address.

`poolConfigTtlMs` defaults to 60,000 milliseconds. Configuration and SDK reserve
snapshots refresh together on configuration, position, statistics, APY, reserve,
total supply/borrow, and liquidation discovery reads. Concurrent refreshes share
one load; failed loads do not extend the cache TTL. `getPoolConfig()` returns a
copy so callers cannot mutate the cached assets.

Asset factors are decimal strings: `collateralFactor` is `c_factor / 10^7`, the
legacy `liquidationFactor` field contains `l_factor / 10^7` (the liability factor),
and `reserveFactor` is the pool's backstop take rate. `maxBorrowRate` is the APR
at full utilization using the snapshot's interest-rate modifier, not a permanent
upper bound on future interest rates.

With `indexerUrl`, discovery requests `GET /pools/<pool-address>/positions` at
that base URL. The response must be `{ "users": ["G...", "C..."] }` with complete
user addresses. Duplicate users are evaluated once. HTTP errors and malformed
responses reject discovery; an empty `users` array is a successful empty result.

Without an indexer, discovery scans `borrow` and `supply_collateral` contract
events. `eventLookbackLedgers` defaults to 17,280 ledgers (roughly one day at five
seconds per ledger), clamped to the RPC node's retained history. The scan follows
RPC cursors with 1,000 events per page, fixes an upper ledger at scan start, and
ignores failed calls and malformed events. A stalled cursor, RPC error, or more
than 100 pages rejects the scan instead of returning an incomplete success.
Both options must be positive safe integers.

**Event discovery only finds users active within that window.** It cannot find
all older borrowers. Use an indexer with historical coverage for complete pool
monitoring. Each discovered user's current position is evaluated against the
requested health-factor threshold; one failed position read is logged and does
not prevent checking the remaining users. Estimated profit remains the existing
placeholder and discovery does not submit liquidation transactions.
