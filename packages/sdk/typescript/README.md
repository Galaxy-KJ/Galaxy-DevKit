# Galaxy TypeScript REST SDK

`GalaxyClient` exposes the REST endpoints implemented on current `main`. The
root entry point uses native `fetch` and imports no server, database, WebSocket,
or Stellar runtime. It works in Node 18+ and browsers with fetch/AbortController.
ESM, CommonJS and declarations are built together. Existing Stellar path-payment
helpers remain available through the separate `./stellar/*` subpaths.

**This package is private while the API contract and remaining services are
incomplete.** It is not a new npm release and does not fix copies of the empty
v5.0.0 already installed from npm. A future public API release needs a major
version bump and the canonical OpenAPI contract.

## Build and quick start

From the repository root, after installing workspace dependencies:

```sh
npm run build --workspace @galaxy-kj/sdk-typescript
npm test --workspace @galaxy-kj/sdk-typescript -- --runInBand
npm run type-check --workspace @galaxy-kj/sdk-typescript
```

In a consumer linked to this built workspace package:

```ts
import { GalaxyClient, GalaxyApiError } from '@galaxy-kj/sdk-typescript';

const client = new GalaxyClient({
  baseUrl: 'http://127.0.0.1:3000', // server root; do not append /api/v1
  network: 'testnet',
  apiKey: process.env.GALAXY_API_KEY, // optional for public reads
  timeoutMs: 30_000,
});

const quote = await client.defi.aggregator.getQuote({
  assetIn: 'XLM',
  assetOut: process.env.GALAXY_ASSET_OUT!, // a configured testnet CODE:ISSUER
  amountIn: '1.0000001',
});

if (!client.oracles.available) {
  // Show client.oracles.reason rather than calling a nonexistent REST route.
}
```

CommonJS uses `const { GalaxyClient } = require('@galaxy-kj/sdk-typescript')`.
Browser consumers use the same import through their bundler; native browsers can
load `dist/esm/index.js` from a static host. Provide configuration directly in a
browser (there is no `process.env`). Any browser API key is visible to the user;
never embed an administrative key. Cross-origin servers must allow `x-api-key`
and `Content-Type` in their CORS configuration.

## Available API

All methods return promises, accept a final optional `{ signal: AbortSignal }`,
and return the REST JSON unchanged. Decimal amounts are strings. JSON dates stay
strings. Types describe the current wire contract, not runtime schema validation.

| Method | Request | Response |
| --- | --- | --- |
| `defi.blend.getPosition(publicKey)` | Stellar G-account address | `BlendPosition`, optionally with APY fields |
| `defi.blend.supply/withdraw/borrow/repay(input)` | `BlendOperationRequest`: asset, amount, signerPublicKey | `TransactionResult` |
| `defi.soroswap.getQuote(input)` | `QuoteRequest`: assetIn, assetOut, amountIn | `SwapQuote` |
| `defi.soroswap.swap(input)` | Quote fields plus minAmountOut, signerPublicKey | `TransactionResult` |
| `defi.soroswap.addLiquidity(input)` | assetA, assetB, amountA, amountB, signerPublicKey | `TransactionResult` |
| `defi.soroswap.removeLiquidity(input)` | assetA, assetB, poolAddress, lpAmount, signerPublicKey; optional minAmountA/minAmountB | `TransactionResult` |
| `defi.aggregator.getQuote(input)` | Quote fields; optional two-element `splits` tuple | `AggregatorQuote` |

Assets use `XLM`/`NATIVE` or `CODE:ISSUER`, as accepted by the REST handlers.
Splits are serialized as comma-separated weights. Only supported public request
fields are forwarded; no facade method accepts a private key, signs or submits.

**Unsigned transaction response:** the current handlers put unsigned XDR in
`TransactionResult.hash`, with `status: 'pending'` and `ledger: 0`. This is not a
submitted transaction hash or a successful on-chain operation. Do not infer
settlement from it. The SDK preserves this existing wire format.

## Transport and errors

`apiKey` is sent in `x-api-key`, never in a URL. Base URLs may include a proxy
prefix, but cannot include user credentials, queries or fragments. Cookies are
omitted and redirects rejected, so credentials are not forwarded to redirect
destinations. Requests are not automatically retried, including mutations.

- HTTP failures throw `GalaxyApiError` with `status`, `code` and message. JSON
  error codes/messages are preserved; non-JSON HTTP errors retain their status.
- Non-JSON successful responses throw `GalaxyTransportError('INVALID_RESPONSE')`.
- Timeouts abort the request and throw `GalaxyTransportError('TIMEOUT')`.
- Caller aborts and network errors propagate. Timers/listeners are cleaned up.
- Supply `fetch` in the constructor to inject an HTTP implementation for tests.

## Explicitly unavailable

| Capability | Current limitation |
| --- | --- |
| `wallets` | `{ available: false, reason }`; the wallet router is not mounted in the server. No wallet methods are invented. |
| `oracles` | Same descriptor; no oracle REST routes exist. |
| `automation` | Same descriptor; no automation REST routes exist. |
| Mainnet | Constructor rejects it. Current REST DeFi config is hard-coded to testnet; a client setting cannot change the server network. Operators must ensure the configured server actually uses testnet. |
| OpenAPI-generated types | #198 was closed without adding a spec. `src/types.ts` is explicitly hand-maintained from actual handlers/core types. There is no pretend generation command. |
| Pool analytics | Not exposed: the underlying response includes bigint reserves without a REST JSON conversion contract. |
| Subscriptions | No WebSocket client is included. |

No backend code is changed by this SDK-only implementation. These limitations
must be resolved upstream before all of #487's original criteria can be met.

## Local-server example and validation

See [the runnable example](../../../docs/examples/sdk/local-rest.mjs) and its
[instructions](../../../docs/examples/sdk/README.md). The `--probe` mode verifies
the existing route's validation response without chain access; normal mode asks
the local server for a real quote using a configured testnet output asset.

```sh
npm run build --workspace @galaxy-kj/sdk-typescript
node docs/examples/sdk/local-rest.mjs --probe
```

`npm run test:package --workspace @galaxy-kj/sdk-typescript` checks both named
package imports and native Chromium ESM/fetch against a local HTTP fixture.
Install Chromium with the repository's Playwright tooling first. SDK tests also
exercise the actual DeFi router on a local socket with protocol/auth/audit mocks;
this does not claim live-chain, auth-database or full-server integration coverage.
