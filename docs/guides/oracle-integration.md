# Oracle Integration Guide

This guide explains how the three Oracle layers in Galaxy DevKit fit together: **off-chain price fetching** → **on-chain Soroban oracle** → **Automation price-trigger rules**.

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  Off-chain layer                                    │
│  CoinGeckoSource / CoinMarketCapSource              │
│  OracleAggregator  (median, TWAP, weighted, mean)  │
│  In-memory cache (TTL 30 s), circuit breaker        │
└────────────────────────┬────────────────────────────┘
                         │  AggregatedPrice
                         ▼
┌─────────────────────────────────────────────────────┐
│  On-chain layer  (Soroban oracle contract)          │
│  Prices written on-chain for Soroban dApps          │
│  Read via oracle.getPrice('XLM/USDC')               │
└────────────────────────┬────────────────────────────┘
                         │  price threshold check
                         ▼
┌─────────────────────────────────────────────────────┐
│  Automation layer                                   │
│  AutomationService + ConditionEvaluator             │
│  PRICE trigger → fires rule when threshold crossed  │
└─────────────────────────────────────────────────────┘
```

## Layer 1 — Off-chain price feeds

`OracleAggregator` polls one or more off-chain sources, validates the data, removes statistical outliers, and returns a single `AggregatedPrice`.

### Supported assets (CoinGecko source)

`XLM`, `BTC`, `ETH`, `USDC`, `USDT`, `SOL`, `ADA`, `DOT`, `AVAX`, `LINK`, `UNI`, `ATOM`, `DOGE`, `MATIC`, `LTC`, `BCH`, `XRP`, `ALGO`, `NEAR` and more — see `CoinGeckoSource` for the full mapping.

### Quickstart

```ts
import { OracleAggregator } from '@galaxy-kj/core-oracles';
import { CoinGeckoSource } from '@galaxy-kj/core-oracles/sources/real/CoinGeckoSource';
import { MedianStrategy } from '@galaxy-kj/core-oracles/aggregator/strategies/MedianStrategy';

// Build the aggregator
const aggregator = new OracleAggregator(
  {
    minSources: 1,           // require at least 1 live source
    maxDeviationPercent: 10, // discard prices >10% from median
    maxStalenessMs: 60_000,  // reject prices older than 60 s
    enableOutlierDetection: true,
    outlierThreshold: 2.0,   // Z-score threshold
    anomalyDetection: {
      stalePriceMs: 60_000,
      outlierStdDevMultiplier: 2,
      flashCrashPercent: 20,
      sourceDisagreementPercent: 10,
      enforceFlashCrashProtection: true,
      enforceSourceDisagreement: false,
    },
  },
  { ttlMs: 30_000 }          // cache TTL
);

// Register a source (optionally supply a CoinGecko API key for higher rate limits)
aggregator.addSource(new CoinGeckoSource(process.env.COINGECKO_API_KEY), 1.0);

// Fetch an aggregated price
const price = await aggregator.getAggregatedPrice('XLM/USD');
console.log(price.price);       // e.g. 0.1234
console.log(price.confidence);  // 0–1 based on source agreement
console.log(price.sourcesUsed); // ['coingecko']
```

### Aggregation strategies

| Strategy | Class | Description |
|----------|-------|-------------|
| `median` | `MedianStrategy` | Median of all source prices (default, outlier-resistant) |
| `mean` | `MeanStrategy` | Simple arithmetic average |
| `weighted` | `WeightedAverageStrategy` | Weighted by per-source `weight` values |
| `twap` | `TWAPStrategy` | Time-weighted average; uses recency of each sample |

```ts
import { TWAPStrategy } from '@galaxy-kj/core-oracles/aggregator/strategies/TWAPStrategy';

aggregator.setStrategy(new TWAPStrategy());
const twapPrice = await aggregator.getAggregatedPrice('XLM/USD');
```

### Adding multiple sources

```ts
import { CoinGeckoSource } from '@galaxy-kj/core-oracles/sources/real/CoinGeckoSource';
import { CoinMarketCapSource } from '@galaxy-kj/core-oracles/sources/real/CoinMarketCapSource';

aggregator.addSource(new CoinGeckoSource(), 1.0);
aggregator.addSource(new CoinMarketCapSource(process.env.CMC_API_KEY), 0.8);

// At least minSources must respond for a successful aggregation
const price = await aggregator.getAggregatedPrice('BTC/USD');
```

### Caching behaviour

Results are cached in memory. Within the `maxStalenessMs` window (default 60 s), subsequent calls return the cached value without hitting remote APIs. Call `aggregator.clearCache()` to force a fresh fetch.

### Circuit breaker

Each source has an independent circuit breaker. After `failureThreshold` (default 5) consecutive errors the source is placed in `OPEN` state and skipped. After `resetTimeoutMs` (default 60 s) it transitions to `HALF_OPEN` and will be retried.

```ts
const health = await aggregator.getSourceHealth();
// Map<string, boolean>  e.g.  { coingecko: true, coinmarketcap: false }
```

### CLI equivalent

```bash
galaxy oracle price XLM/USD --strategy median
galaxy oracle price XLM/USD --strategy twap --watch 10s
galaxy oracle sources list
galaxy oracle validate XLM/USD --threshold 5
```

See [Oracle CLI reference](../cli/oracle.md) for the full command reference.

---

## Layer 2 — On-chain Soroban oracle

The on-chain oracle (`packages/contracts/price-oracle`) stores a bounded price-history ring buffer per asset pair on Stellar/Soroban, so other Soroban contracts — and DeFi integrations that need manipulation-resistant pricing — can read price data and a Time-Weighted Average Price (TWAP) directly without an off-chain call.

### Contract interface

```rust
// packages/contracts/price-oracle — deployed contract surface
pub fn initialize(env: &Env, admin: Address);
pub fn add_pusher(env: &Env, admin: Address, pusher: Address);
pub fn remove_pusher(env: &Env, admin: Address, pusher: Address);

pub fn push_price(env: &Env, pusher: Address, base: Symbol, quote: Symbol, price: i128);

pub fn get_price(env: &Env, base: Symbol, quote: Symbol) -> PriceEntry;
pub fn get_price_history(env: &Env, base: Symbol, quote: Symbol) -> Vec<PriceEntry>;
pub fn get_price_checked(env: &Env, base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceResult;
pub fn get_price_strict(env: &Env, base: Symbol, quote: Symbol, max_age_seconds: u64) -> PriceEntry;
pub fn get_all_prices(env: &Env) -> Map<(Symbol, Symbol), PriceEntry>;

// TWAP — manipulation-resistant pricing
pub fn get_twap(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_window(env: &Env, base: Symbol, quote: Symbol, window_seconds: u64) -> i128;
pub fn get_twap_5m(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_15m(env: &Env, base: Symbol, quote: Symbol) -> i128;
pub fn get_twap_1h(env: &Env, base: Symbol, quote: Symbol) -> i128;
```

Prices are scaled by 1,000,000 (six implied decimals). Price history is a fixed-capacity ring buffer (`TWAP_WINDOW_SIZE = 10` observations per pair) — `get_twap_window` computes a time-weighted average over the requested window using whichever of those observations fall inside it, correctly holding the last known price constant across gaps larger than the window.

### TypeScript SDK usage

```ts
import { OnChainOracleSource, verifyOnChainTwap } from '@galaxy-kj/core-oracles';

const source = new OnChainOracleSource(contractId, rpcUrl);

const price = await source.getPrice('XLM/USDC');
// { price: number, timestamp: Date, source: 'on-chain-oracle', metadata: {...} }

const twap5m = await source.getTwapWindow('XLM/USDC', 300);

// Independently recompute the TWAP from raw history and compare against the
// contract's own get_twap_window result, to catch a manipulated/diverging value.
const verification = await verifyOnChainTwap(source, 'XLM/USDC', 300);
// { matches: boolean, onChainTwap, recomputedTwap, diffBps, history }
```

### Update cadence

The off-chain aggregator (Layer 1) fetches prices and writes the result to the Soroban oracle contract on a configurable interval. A typical production setup might update every 5–30 seconds, batching multiple assets in one transaction to minimise fees.

---

## Layer 3 — Automation price-trigger rules

`AutomationService` integrates directly with `OracleAggregator` to evaluate price conditions and fire automated Stellar operations when thresholds are crossed.

### Price trigger rule shape

```ts
import {
  AutomationRule,
  AutomationStatus,
  TriggerType,
  ConditionLogic,
  ConditionOperator,
  ExecutionType,
} from '@galaxy-kj/core-automation';

const priceRule: AutomationRule = {
  id: 'rule-xlm-swap-001',
  name: 'Swap when XLM/USDC > 0.15',
  userId: 'user-abc',
  status: AutomationStatus.ACTIVE,
  triggerType: TriggerType.PRICE,

  conditionGroup: {
    logic: ConditionLogic.AND,
    conditions: [
      {
        type: 'price',
        id: 'cond-1',
        asset: 'XLM',
        operator: ConditionOperator.GREATER_THAN,
        threshold: 0.15,
        quoteAsset: 'USD',
      },
    ],
  },

  executionType: ExecutionType.STELLAR_SWAP,
  executionConfig: {
    swapConfig: {
      sendAsset: { code: 'XLM' },
      sendMax: '500',
      destinationAsset: {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      },
      destinationAmount: '75',
      destinationAccount: 'GDESTINATION...',
    },
    retryAttempts: 3,
    retryDelay: 5000,
    memo: 'auto-swap',
  },

  createdAt: new Date(),
  updatedAt: new Date(),
  executionCount: 0,
  failureCount: 0,
};
```

### Wiring the oracle to AutomationService

Pass your configured `OracleAggregator` instance to `AutomationService` so that price-condition evaluation uses live prices:

```ts
import { OracleAggregator } from '@galaxy-kj/core-oracles';
import { CoinGeckoSource } from '@galaxy-kj/core-oracles/sources/real/CoinGeckoSource';
import { AutomationService } from '@galaxy-kj/core-automation';

const aggregator = new OracleAggregator({ minSources: 1 });
aggregator.addSource(new CoinGeckoSource(process.env.COINGECKO_API_KEY));

const automation = new AutomationService({
  network: {
    type: 'TESTNET',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  sourceSecret: process.env.AUTOMATION_SIGNER_SECRET!,
  oracle: aggregator,   // <-- inject oracle here
});
```

### Registering and running the rule

```ts
// Register the rule
await automation.registerRule(priceRule);

// The service evaluates PRICE-trigger rules on a polling interval
// (configurable; default is driven by the cron scheduler).
// You can also trigger evaluation manually:
automation.emit('evaluate', { ruleId: priceRule.id });
```

### Listening for execution results

```ts
automation.on('execution:success', (result) => {
  console.log('Rule fired:', result.ruleId);
  console.log('TX hash:', result.transactionHash);
});

automation.on('execution:failure', (result) => {
  console.error('Rule failed:', result.ruleId, result.error?.message);
});
```

---

## End-to-end example — trigger a swap when XLM/USDC > 0.15

The following self-contained example runs on testnet.

```ts
import { OracleAggregator } from '@galaxy-kj/core-oracles';
import { CoinGeckoSource } from '@galaxy-kj/core-oracles/sources/real/CoinGeckoSource';
import { AutomationService } from '@galaxy-kj/core-automation';
import {
  AutomationRule,
  AutomationStatus,
  TriggerType,
  ConditionLogic,
  ConditionOperator,
  ExecutionType,
} from '@galaxy-kj/core-automation/types/automation-types';

async function main() {
  // ── 1. Build oracle ───────────────────────────────────────────────
  const oracle = new OracleAggregator({ minSources: 1, maxStalenessMs: 30_000 });
  oracle.addSource(new CoinGeckoSource());

  // Quick sanity check
  const current = await oracle.getAggregatedPrice('XLM/USD');
  console.log('Current XLM/USD:', current.price);

  // ── 2. Build automation service ───────────────────────────────────
  const automation = new AutomationService({
    network: {
      type: 'TESTNET',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    sourceSecret: process.env.AUTOMATION_SIGNER_SECRET!,
    oracle,
  });

  // ── 3. Define the rule ────────────────────────────────────────────
  const rule: AutomationRule = {
    id: 'e2e-swap-rule',
    name: 'Swap XLM → USDC when price exceeds 0.15',
    userId: 'demo-user',
    status: AutomationStatus.ACTIVE,
    triggerType: TriggerType.PRICE,
    conditionGroup: {
      logic: ConditionLogic.AND,
      conditions: [
        {
          type: 'price',
          id: 'xlm-price-check',
          asset: 'XLM',
          operator: ConditionOperator.GREATER_THAN,
          threshold: 0.15,
        },
      ],
    },
    executionType: ExecutionType.STELLAR_SWAP,
    executionConfig: {
      swapConfig: {
        sendAsset: {},               // native XLM
        sendMax: '100',
        destinationAsset: {
          code: 'USDC',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // testnet
        },
        destinationAmount: '14',
        destinationAccount: process.env.DESTINATION_ADDRESS!,
      },
      retryAttempts: 2,
      memo: 'oracle-triggered-swap',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
    failureCount: 0,
    maxExecutions: 1, // fire once then stop
  };

  // ── 4. Register and listen ────────────────────────────────────────
  await automation.registerRule(rule);

  automation.on('execution:success', (result) => {
    console.log('Swap executed! TX:', result.transactionHash);
    process.exit(0);
  });

  automation.on('execution:failure', (result) => {
    console.error('Swap failed:', result.error?.message);
    process.exit(1);
  });

  console.log('Watching XLM/USD price. Will swap when > 0.15 …');
}

main().catch(console.error);
```

Run on testnet:

```bash
AUTOMATION_SIGNER_SECRET=S... DESTINATION_ADDRESS=G... npx ts-node e2e-oracle-swap.ts
```

---

## Configuration reference

### OracleAggregator options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minSources` | `number` | `2` | Minimum live sources required for a valid price |
| `maxDeviationPercent` | `number` | `10` | Max % spread allowed between sources |
| `maxStalenessMs` | `number` | `60000` | Reject cached entries older than this |
| `enableOutlierDetection` | `boolean` | `true` | Filter statistical outliers via Z-score |
| `outlierThreshold` | `number` | `2.0` | Z-score threshold for outlier removal |
| `anomalyDetection.stalePriceMs` | `number` | `60000` | Stale price threshold for frame validation |
| `anomalyDetection.flashCrashPercent` | `number` | `25` | Max drop allowed vs previous aggregated price |
| `anomalyDetection.sourceDisagreementPercent` | `number` | `15` | Max spread allowed across active sources |

### AutomationService options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `network` | `StellarNetwork` | TESTNET | Horizon URL + network passphrase |
| `sourceSecret` | `string` | — | Stellar secret key used to sign automation transactions |
| `oracle` | `OracleAggregator` | — | Oracle instance for PRICE trigger evaluation |
| `maxConcurrentExecutions` | `number` | `10` | Max parallel rule executions |
| `executionTimeout` | `number` | `300000` | Per-execution timeout in ms |

---

## Related docs

- [Oracle CLI reference](../cli/oracle.md) — `galaxy oracle price`, `history`, `validate`
- [Automation types](../../packages/core/automation/src/types/automation-types.ts) — full type definitions
- [DeFi aggregation flow](../architecture/defi-aggregation-flow.md) — how oracle feeds connect to the swap routing layer
- [Guides index](./index.md)
