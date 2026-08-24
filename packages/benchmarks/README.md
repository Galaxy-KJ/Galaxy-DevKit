# @galaxy-kj/benchmarks

Micro-benchmarks (tinybench, no network) and k6 load scenarios for Galaxy DevKit.

## Commands

From the repo root:

```
npm run bench          # micro suites, writes packages/benchmarks/results/micro-latest.json
npm run load:smoke     # k6 1 VU against a local REST API or the bundled fixture
```

Inside this package:

```
npm run bench:compare  # compare results/micro-latest.json to the baseline (no re-run)
npm test               # comparator unit tests including a deliberate +25% p95 regression
npm run load:average   # requires BASE_URL and k6
npm run load:stress
npm run load:spike
npm run load:soak
npm run load:websocket
```

## Environment

| Var | Default | Used by |
|---|---|---|
| `BASE_URL` | `http://127.0.0.1:3000` | every k6 script |
| `VUS` | per-script | k6 |
| `DURATION` | per-script | k6 |
| `WS_URL` | derived from BASE_URL | websocket.js |
| `PORT` | `3456` | fixture / smoke runner |
| `CI` | unset | when `true` compare uses `baselines/micro.ci.json` |
| `BENCH_BASELINE` | auto | override baseline path |
| `BENCH_INJECT_CACHE_MISS` | unset | set to `1` on `npm run bench` to make the cache-hit path miss |

Scripts refuse any URL containing `mainnet`.

`npm run load:smoke` starts `load/fixture-server.mjs` when nothing is listening on `PORT` and `BASE_URL` is unset. Point `BASE_URL` at a real REST process to measure the live API.

There is no wallet-creation route under `packages/api/rest/src/routes/wallets/` today (only `submit-tx`). Load scripts target `submit-tx`, defi quotes, health, monitoring, and compliance reads.

## Refreshing a baseline

When a slowdown is intentional:

1. Run `npm run bench`
2. Copy `results/micro-latest.json` over `baselines/micro.json` (local) or `baselines/micro.ci.json` (from a GitHub ubuntu-latest job)
3. Commit the baseline with the reason in the commit body
