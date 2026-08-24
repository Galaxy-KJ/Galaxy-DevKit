# Performance Benchmarks

This repo measures the hot paths that used to ship with unverifiable claims (#342 indexing, #343 caching, #80 load testing).

## Micro (no network)

```bash
npm run bench
```

Runs tinybench suites in `packages/benchmarks/src/suites/`:

| Suite | What it measures |
|---|---|
| encryption | `encryptPrivateKey` / `decryptPrivateKey` Argon2id v2 vs PBKDF2 v1 |
| cache | `CacheManager` hit, miss, eviction, request dedup |
| stellar-xdr | `TransactionBuilder` + `toXDR` (same path as `StellarService.sendPayment` after `loadAccount`) |
| smart-router | `SmartRouter.findOptimalRoute` with a fake quote service and 3 transit assets |
| oracle-twap | `TWAPCalculator.getTWAP` over 64 in-memory samples |

Output: `packages/benchmarks/results/micro-latest.json`.

```bash
npm run bench
npm run bench:compare --workspace=@galaxy-kj/benchmarks
```

`bench:compare` reads `results/micro-latest.json` and does not re-run the suites. It fails if a suite's p95 is worse than baseline × 1.2 (× 3 for Argon2) or throughput drops more than 20%.

There are two baselines:

- `baselines/micro.json` — local laptop numbers (used when `CI` is unset)
- `baselines/micro.ci.json` — `ubuntu-latest` numbers from GitHub Actions (used when `CI=true`)

Do not compare a laptop run against the CI file. To refresh the CI baseline, copy `results/micro-latest.json` from a green Actions job (or an `ubuntu-latest` run) onto `baselines/micro.ci.json`.

A deliberate cache regression is detected by:

```bash
BENCH_INJECT_CACHE_MISS=1 npm run bench
npm run bench:compare --workspace=@galaxy-kj/benchmarks
```

The comparator itself is unit-tested with a fake +25% p95 (`npm run test --workspace=@galaxy-kj/benchmarks`).

## Load (k6)

Install k6 (`brew install k6` or see [k6 docs](https://grafana.com/docs/k6/latest/set-up/install-k6/)).

```bash
npm run load:smoke
```

If `BASE_URL` is unset, a fixture server starts on `PORT` (default 3456) that implements `/health/live` and cached `/api/v1/defi/*` GETs. Point `BASE_URL` at a real REST process to measure the live API:

```bash
BASE_URL=http://127.0.0.1:3000 VUS=10 DURATION=1m k6 run packages/benchmarks/load/average.js
```

Profiles: `smoke.js` (1 VU), `average.js`, `stress.js`, `spike.js`, `soak.js`, `websocket.js`.

Never pass a mainnet URL. Scripts throw if `BASE_URL` contains `mainnet`.

Wallet creation is not a REST route in `packages/api/rest/src/routes/wallets/` (only `submit-tx`). Full profiles hit `submit-tx`, defi quotes, health, monitoring, and compliance reads. Cache hit ratio is on `GET /api/v1/monitoring/cache/stats`. Soak samples `GET /metrics` (prom-client RSS).

## CI

`.github/workflows/benchmarks.yml`:

- Every PR: comparator unit tests, `npm run bench`, baseline compare, k6 smoke (fixture). Budget is a few minutes.
- Nightly / `workflow_dispatch`: average + spike against the fixture.

Existing `ci.yml` / `quick-check.yml` are unchanged.

## Updating a baseline

When a slowdown is intentional, copy `packages/benchmarks/results/micro-latest.json` over the matching baseline (`micro.json` locally, `micro.ci.json` from a GitHub `ubuntu-latest` run) and commit it with the reason.

## First measured numbers

Captured on a local arm64 machine (`Sebastians-MacBook-Pro.local`, 2026-08-24). See `packages/benchmarks/baselines/micro.json` for the raw JSON.

| Path | hz | mean | p95 |
|---|---|---|---|
| encrypt v2 Argon2id | 41 | 24.2 ms | 25.9 ms |
| decrypt v2 Argon2id | 38 | 26.4 ms | 34.2 ms |
| encrypt v1 PBKDF2 | 135 | 7.4 ms | 7.8 ms |
| decrypt v1 PBKDF2 | 136 | 7.4 ms | 8.1 ms |
| cache hit | 3.3e6 | 0.30 µs | 0.46 µs |
| cache miss | 1.3e6 | 0.75 µs | 1.8 µs |
| tx build + toXDR | 4.7e3 | 0.21 ms | 0.46 ms |
| smart router 3 pools | 7.3e4 | 13.8 µs | 32 µs |
| oracle TWAP 64 samples | 1.2e6 | 0.80 µs | 1.0 µs |

Argon2id v2 is about 3.3× the cost of PBKDF2 v1 on this machine. Cache hits are about 2.5× the throughput of misses.

k6 smoke against the local fixture (1 VU, 10s): p95 HTTP 1.08 ms, 0% errors, 6.6 req/s.

CI multiplies the p95/hz slack by `BENCH_SLACK=3` so GitHub runners are not compared 1:1 against a laptop.
