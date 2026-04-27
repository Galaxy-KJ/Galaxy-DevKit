# Galaxy DevKit REST API Reference

This document describes the actual HTTP endpoints implemented in `packages/api/rest/`. All endpoints reflect the live route code — no invented fields.

> **Note on private keys:** The Galaxy DevKit REST API never returns or accepts private keys. The non-custodial architecture keeps all private key material on the client device.

## Base URL

| Environment | URL |
|-------------|-----|
| Local development | `http://localhost:3000` |
| Testnet | Configure via `STELLAR_RPC_URL` / `STELLAR_HORIZON_URL` env vars |

## Authentication

Most mutating endpoints require a valid JWT from Supabase Auth.

```http
Authorization: Bearer <supabase-jwt>
```

Read-only DeFi endpoints (quotes, positions, analytics) are unauthenticated.

---

## DeFi — Soroswap

### GET /api/v1/defi/swap/quote

Get a swap quote from Soroswap. No authentication required.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `assetIn` | string | Yes | Input asset. `XLM` or `NATIVE` for native XLM; `CODE:ISSUER` for non-native (e.g. `USDC:GA5ZS...`) |
| `assetOut` | string | Yes | Output asset (same format) |
| `amountIn` | string | Yes | Amount of `assetIn` to swap (decimal string, e.g. `"100"`) |

**Response 200**

```json
{
  "amountOut": "14.2300000",
  "priceImpact": "0.003",
  "path": ["XLM", "USDC"],
  "minAmountOut": "14.0900000"
}
```

**Error 400**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "assetIn, assetOut, and amountIn are required query parameters",
    "details": {}
  }
}
```

**Example**

```bash
curl "http://localhost:3000/api/v1/defi/swap/quote?assetIn=XLM&assetOut=USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN&amountIn=100"
```

---

### POST /api/v1/defi/swap

Build an unsigned Soroswap swap transaction and return the XDR for client-side signing. **Requires JWT.**

**Request body**

```json
{
  "assetIn": "XLM",
  "assetOut": "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "amountIn": "100",
  "minAmountOut": "14.09",
  "signerPublicKey": "GABC123..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetIn` | string | Yes | Input asset |
| `assetOut` | string | Yes | Output asset |
| `amountIn` | string | Yes | Amount to swap |
| `minAmountOut` | string | Yes | Slippage floor |
| `signerPublicKey` | string | Yes | Stellar public key of the signer (G...) |

**Response 200** — unsigned transaction XDR ready for client signing

```json
{
  "xdr": "AAAAAgAAAA...",
  "network": "testnet"
}
```

---

## DeFi — Blend (lending)

The frontend Blend playground panel computes a live health factor from collateral and debt values:

- Green when `healthFactor > 1.5`
- Yellow when `healthFactor > 1.2`
- Red when `healthFactor < 1.2`

### GET /api/v1/defi/blend/position/:publicKey

Get the Blend lending position for a Stellar public key. No authentication required.

**Path parameter:** `publicKey` — Stellar account public key (G...)

**Response 200**

```json
{
  "supplied": [
    { "asset": "USDC", "amount": "500.0000000", "apy": "0.042" }
  ],
  "borrowed": [
    { "asset": "XLM", "amount": "1000.0000000", "apy": "0.061" }
  ],
  "healthFactor": "1.82",
  "collateralValue": "510.00",
  "debtValue": "120.00"
}
```

---

### POST /api/v1/defi/blend/supply

Build an unsigned Blend supply transaction. **Requires JWT.**

**Request body**

```json
{
  "asset": "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "amount": "500",
  "signerPublicKey": "GABC123..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `asset` | string | Yes | Asset to supply (`CODE:ISSUER` or `XLM`) |
| `amount` | string | Yes | Amount to supply |
| `signerPublicKey` | string | Yes | Signer's Stellar public key |

**Response 200** — unsigned XDR

```json
{
  "xdr": "AAAAAgAAAA...",
  "network": "testnet"
}
```

---

### POST /api/v1/defi/blend/withdraw

Build an unsigned Blend withdrawal transaction. **Requires JWT.**

**Request body** — same shape as `/blend/supply`

---

### POST /api/v1/defi/blend/borrow

Build an unsigned Blend borrow transaction. **Requires JWT.**

**Request body** — same shape as `/blend/supply`

---

### POST /api/v1/defi/blend/repay

Build an unsigned Blend repay transaction. **Requires JWT.**

**Request body** — same shape as `/blend/supply`

---

## DeFi — Liquidity pools

### POST /api/v1/defi/liquidity/add

Build an unsigned Soroswap add-liquidity transaction. **Requires JWT.**

**Request body**

```json
{
  "assetA": "XLM",
  "assetB": "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "amountA": "1000",
  "amountB": "142",
  "signerPublicKey": "GABC123..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetA` | string | Yes | First asset in the pair |
| `assetB` | string | Yes | Second asset in the pair |
| `amountA` | string | Yes | Amount of assetA to deposit |
| `amountB` | string | Yes | Amount of assetB to deposit |
| `signerPublicKey` | string | Yes | Signer's Stellar public key |

**Response 200** — unsigned XDR

```json
{
  "xdr": "AAAAAgAAAA...",
  "network": "testnet"
}
```

---

### POST /api/v1/defi/liquidity/remove

Build an unsigned Soroswap remove-liquidity transaction. **Requires JWT.**

**Request body**

```json
{
  "assetA": "XLM",
  "assetB": "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  "poolAddress": "CPOOL...",
  "lpAmount": "50",
  "minAmountA": "490",
  "minAmountB": "69",
  "signerPublicKey": "GABC123..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `assetA` | string | Yes | First asset |
| `assetB` | string | Yes | Second asset |
| `poolAddress` | string | Yes | Soroswap pool contract address |
| `lpAmount` | string | Yes | LP token amount to redeem |
| `minAmountA` | string | No | Slippage floor for assetA |
| `minAmountB` | string | No | Slippage floor for assetB |
| `signerPublicKey` | string | Yes | Signer's Stellar public key |

---

### GET /api/v1/defi/pools/analytics

Get liquidity pool analytics (TVL, spot prices, fee APR). No authentication required.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `poolAddress` | string | No | If omitted, returns analytics for all pools. If provided, returns data for that single pool. |

**Response 200 — single pool**

```json
{
  "poolAddress": "CPOOL...",
  "tvl": "284000.00",
  "spotPriceAtoB": "0.1423",
  "spotPriceBtoA": "7.026",
  "feeApr": "0.0312",
  "volume24h": "45200.00"
}
```

**Response 200 — all pools** (array of the above shape)

---

## Wallets — Fee-sponsored transaction submission

### POST /api/v1/wallets/submit-tx

Wrap a client-signed (fee-less) Soroban XDR in a fee-bump envelope using the server's sponsor account and submit it to Stellar. **No JWT required** (rate-limited by wallet ID + global limits).

This is the submission endpoint for non-custodial smart wallet transactions. The backend signs only the fee-bump outer envelope — it never touches the inner transaction or user keys.

**Request body**

```json
{
  "signedTxXdr": "AAAAAgAAAA...",
  "walletId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signedTxXdr` | string | Yes | Base-64 encoded signed Soroban transaction XDR (must NOT already be a fee-bump) |
| `walletId` | string | Yes | UUID of the smart wallet in the `smart_wallets` table |

**Response 200**

```json
{
  "transactionHash": "a1b2c3d4...",
  "ledger": 5012345
}
```

**Error 400** — missing/invalid body fields or XDR parse failure

```json
{
  "error": "Missing or invalid `signedTxXdr` — expected a base-64 XDR string"
}
```

**Error 404** — wallet not found in `smart_wallets` table

```json
{
  "error": "Wallet 3fa85f64-... not found in smart_wallets"
}
```

**Error 502** — Stellar RPC submission error

```json
{
  "error": "Stellar RPC submission failed"
}
```

---

## Error response format

All endpoints return errors in this envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

For the `submit-tx` endpoint, errors are a plain string field:

```json
{ "error": "Description" }
```

### Error codes

| Code | HTTP status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Missing or invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `NOT_FOUND` | 404 | Resource does not exist |
| `INTERNAL_ERROR` | 500 | Server-side error |
| *(plain string)* | 400 / 502 | Used by `submit-tx` endpoint |

---

## Rate limiting

The `submit-tx` endpoint applies two rate limiters:

- **Per user** — enforced by `userSubmitTxLimiter`
- **Global** — enforced by `globalSubmitTxLimiter`

General DeFi endpoints use the shared `rateLimiterMiddleware` applied at the server level.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key (server only) |
| `STELLAR_RPC_URL` | No | Soroban RPC endpoint (default: testnet) |
| `STELLAR_HORIZON_URL` | No | Horizon endpoint (default: testnet) |
| `STELLAR_NETWORK_PASSPHRASE` | No | Network passphrase (default: testnet) |
| `FEE_SPONSOR_SECRET_KEY` | Yes (submit-tx) | Secret key of the fee-sponsor account |
| `FEE_BUMP_BASE_FEE` | No | Base fee for fee-bump txs in stroops (default: `1000000`) |
| `BLEND_POOL_ADDRESS` | No | Blend pool contract address |
| `BLEND_ORACLE_ADDRESS` | No | Blend oracle contract address |
| `SOROSWAP_ROUTER_ADDRESS` | No | Soroswap router contract address |
| `SOROSWAP_FACTORY_ADDRESS` | No | Soroswap factory contract address |
| `PORT` | No | HTTP server port (default: `3000`) |

---

## WebSocket API

The WebSocket server (`packages/api/websocket/`) is a Socket.io server available separately from the REST API. It provides real-time streams for market prices, transaction status, and automation events.

**Connection**

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: supabaseJwt },
});
```

**Market data channel**

```ts
socket.emit('subscribe:market', { symbol: 'XLM/USD' });
socket.on('market:price', (data) => console.log(data));
```

**Transaction status channel**

```ts
socket.emit('subscribe:transaction', { hash: 'abc123...' });
socket.on('transaction:status', (data) => console.log(data.status));
```

**Automation events channel**

```ts
socket.emit('subscribe:automation', { userId: 'user-abc' });
socket.on('automation:triggered', (event) => console.log(event));
socket.on('automation:executed', (result) => console.log(result));
```

---

## Related docs

- [Getting Started](../guides/getting-started.md)
- [Oracle Integration Guide](../guides/oracle-integration.md) — price feeds wired to automation
- [Social Login Integration Guide](../guides/social-login-integration.md) — WebAuthn + OAuth wallet onboarding
- [Smart Wallet Integration Guide](../smart-wallet/integration-guide.md) — producing signed XDR for `submit-tx`
