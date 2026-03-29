# Smart Wallet Contract Deployment Runbook

Step-by-step operational runbook for deploying the `smart-wallet-account` factory and wallet contracts from local development through testnet to mainnet, including fee-bump sponsor account setup.

> Related: [Contract reference](./smart-wallet-contract.md) | [Existing deployment guide](./deployment.md)

---

## Prerequisites

### Tools

```bash
# Rust toolchain with wasm target
rustup target add wasm32-unknown-unknown

# Stellar CLI (includes Soroban support) — v21+
cargo install --locked stellar-cli --features opt

# Verify
stellar --version
```

### Accounts

You need two funded accounts before deployment:

| Account | Purpose |
|---------|---------|
| `deployer` | Signs contract upload and deployment transactions |
| `fee-sponsor` | Signs fee-bump outer envelopes for all user wallet operations |

### Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Stellar network
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Deployer identity (name registered with Stellar CLI)
DEPLOYER_IDENTITY=deployer

# Fee-bump sponsor
FEE_SPONSOR_SECRET_KEY=S...            # sponsor account secret key
FEE_BUMP_BASE_FEE=1000000             # 0.1 XLM in stroops

# Filled in after deployment:
FACTORY_CONTRACT_ID=
WALLET_WASM_HASH=
```

---

## Step 1 — Create and fund accounts

### Deployer account

```bash
# Generate a new identity
stellar keys generate deployer --network testnet

# Fund via Friendbot (testnet only)
stellar keys fund deployer --network testnet

# Verify balance
stellar account info deployer --network testnet
```

### Fee-sponsor account

The fee-sponsor account pays network fees for all non-custodial user wallet transactions. It must maintain a sufficient XLM balance.

```bash
# Generate sponsor keypair (save the secret key — you will need it in .env)
stellar keys generate fee-sponsor --network testnet
stellar keys fund fee-sponsor --network testnet

# Export and store the secret key in .env.local as FEE_SPONSOR_SECRET_KEY
stellar keys show fee-sponsor
```

**Recommended minimum balance:** 100 XLM on testnet; 500 XLM on mainnet (monitor and replenish).

---

## Step 2 — Build the contracts

From the repository root:

```bash
cd packages/contracts/smart-wallet-account

# Build all contracts in the workspace (wallet + factory)
cargo build --target wasm32-unknown-unknown --release

# Or use the Stellar CLI build command (writes to target/wasm32-unknown-unknown/release/)
stellar contract build
```

Expected output files:

```
target/wasm32-unknown-unknown/release/smart_wallet_account.wasm
target/wasm32-unknown-unknown/release/factory.wasm
```

---

## Step 3 — Upload the wallet WASM

The wallet WASM must be uploaded first. The factory stores its hash so it can deploy new wallet instances deterministically.

```bash
# Upload wallet WASM — note the returned WASM hash
WALLET_WASM_HASH=$(stellar contract upload \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet_account.wasm \
  --source deployer \
  --network testnet)

echo "WALLET_WASM_HASH=$WALLET_WASM_HASH"
```

Save `WALLET_WASM_HASH` to `.env.local`.

---

## Step 4 — Deploy the factory contract

```bash
# Deploy the factory contract
FACTORY_CONTRACT_ID=$(stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/factory.wasm \
  --source deployer \
  --network testnet)

echo "FACTORY_CONTRACT_ID=$FACTORY_CONTRACT_ID"
```

Save `FACTORY_CONTRACT_ID` to `.env.local`.

---

## Step 5 — Initialize the factory

Register the wallet WASM hash with the factory. This can only be called once.

```bash
stellar contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- init \
  --wallet_wasm_hash "$WALLET_WASM_HASH"
```

Verify initialization succeeded:

```bash
# Should return the stored wasm hash
stellar contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- get_wallet \
  --credential_id "dGVzdA=="   # base64("test") — expect null/None
```

---

## Step 6 — Deploy a test wallet instance

Verify the factory can deploy a wallet by running a test deployment with a dummy credential.

```bash
# Base64-encode a test credential ID
TEST_CREDENTIAL=$(echo -n "test-credential-001" | base64)

# A test P-256 public key (65 bytes, 0x04 prefix + 32-byte x + 32-byte y)
# For a real deployment, supply the actual WebAuthn public key
TEST_PUBLIC_KEY="04$(python3 -c "import os; print(os.urandom(64).hex())")"

stellar contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- deploy \
  --deployer deployer \
  --credential_id "$TEST_CREDENTIAL" \
  --public_key "$TEST_PUBLIC_KEY"
```

The returned address is the new wallet contract. Verify it is registered:

```bash
stellar contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --source deployer \
  --network testnet \
  -- get_wallet \
  --credential_id "$TEST_CREDENTIAL"
```

---

## Step 7 — Fee-bump sponsor setup

The `POST /api/v1/wallets/submit-tx` endpoint wraps every user-signed XDR in a fee-bump transaction before submitting to the Stellar network. This lets users transact without holding XLM.

### How it works

1. Client builds and signs a **fee-less** Soroban transaction (base fee = 0).
2. Client POSTs the signed XDR + wallet ID to `/api/v1/wallets/submit-tx`.
3. The server reads `FEE_SPONSOR_SECRET_KEY` from the environment.
4. The server wraps the inner transaction in a `FeeBumpTransaction` and signs the outer envelope.
5. The fee-bump transaction is submitted to Soroban RPC.
6. The sponsor account pays all fees. The user pays nothing.

### Configure the Galaxy DevKit API server

In your server environment (`.env.local` or deployment secrets):

```bash
FEE_SPONSOR_SECRET_KEY=S...         # sponsor account Stellar secret
FEE_BUMP_BASE_FEE=1000000          # 0.1 XLM per tx (adjust for mainnet fee pressure)
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

### Monitoring the sponsor balance

Set up an alert to replenish the sponsor account before it runs dry:

```bash
# Check sponsor balance
stellar account info fee-sponsor --network testnet | grep XLM
```

A depleted sponsor account will cause all `submit-tx` calls to return `502`. Keep at least 50 XLM buffer on testnet, 200 XLM on mainnet.

---

## Step 8 — Testnet smoke test

Run the end-to-end integration test against your deployed contracts:

```bash
# Set env vars before running
export FACTORY_CONTRACT_ID="..."
export WALLET_WASM_HASH="..."
export STELLAR_RPC_URL="https://soroban-testnet.stellar.org"
export FEE_SPONSOR_SECRET_KEY="S..."

# Run the e2e test suite
npx jest packages/core/wallet/src/tests/smart-wallet.service.test.ts --testNamePattern="deploy"

# Or run the full e2e suite (requires Playwright + virtual authenticator)
npx playwright test packages/core/wallet/src/tests/smart-wallet.e2e.test.ts
```

Expected output: all deploy, sign, and submit steps pass.

---

## Step 9 — Mainnet promotion checklist

Before deploying to mainnet, complete every item:

- [ ] All testnet smoke tests pass with the final WASM builds
- [ ] WASM files are compiled with `--release` flag
- [ ] `FACTORY_CONTRACT_ID` and `WALLET_WASM_HASH` recorded in internal runbook / secrets manager
- [ ] Fee-sponsor account funded with ≥ 500 XLM
- [ ] Fee-sponsor account has **no other signers** — it should be a dedicated account
- [ ] `FEE_BUMP_BASE_FEE` adjusted for current mainnet fee pressure (check `stellar network status --network mainnet`)
- [ ] `STELLAR_NETWORK_PASSPHRASE` set to `"Public Global Stellar Network ; September 2015"`
- [ ] `STELLAR_RPC_URL` pointed at a reliable mainnet Soroban RPC endpoint
- [ ] Rate-limit configuration on `submit-tx` endpoint reviewed
- [ ] Alert configured on sponsor account balance
- [ ] Deployment commands reviewed and confirmed by a second engineer

**Deploy to mainnet (same steps as testnet, with `--network mainnet`):**

```bash
stellar contract upload \
  --wasm target/wasm32-unknown-unknown/release/smart_wallet_account.wasm \
  --source deployer \
  --network mainnet

stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/factory.wasm \
  --source deployer \
  --network mainnet

stellar contract invoke \
  --id "$FACTORY_CONTRACT_ID" \
  --source deployer \
  --network mainnet \
  -- init \
  --wallet_wasm_hash "$WALLET_WASM_HASH"
```

---

## Environment variable reference

| Variable | Required | Description |
|----------|----------|-------------|
| `FACTORY_CONTRACT_ID` | Yes | Deployed factory contract address (C...) |
| `WALLET_WASM_HASH` | Yes | Uploaded wallet WASM hash (hex) |
| `FEE_SPONSOR_SECRET_KEY` | Yes | Stellar secret key (S...) of the fee-sponsor account |
| `FEE_BUMP_BASE_FEE` | No | Base fee in stroops for fee-bump txs (default: `1000000` = 0.1 XLM) |
| `STELLAR_RPC_URL` | No | Soroban RPC endpoint (default: testnet) |
| `STELLAR_HORIZON_URL` | No | Horizon endpoint (default: testnet) |
| `STELLAR_NETWORK_PASSPHRASE` | No | Network passphrase (default: testnet) |
| `SUPABASE_URL` | Yes (API) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (API) | Supabase service-role key |

---

## Troubleshooting

### `Error: FEE_SPONSOR_SECRET_KEY is not configured`

The API server is missing the sponsor secret. Add it to your environment and restart.

### `Wallet <id> not found in smart_wallets`

The `walletId` sent to `submit-tx` does not exist in the `smart_wallets` Supabase table. The wallet must be registered in the database before transactions can be sponsored.

### `XDR is already a fee-bump transaction`

The client sent a pre-wrapped fee-bump. The `submit-tx` endpoint accepts only inner (non-fee-bump) signed transactions.

### Factory `init` fails with `AlreadyInitialized`

`init` was already called. The factory is deployed and ready — skip to Step 6.

### `Insufficient sources` from OracleAggregator during automation

The oracle cannot reach at least `minSources` live sources. Check `CoinGeckoSource` rate limits and API key configuration.

---

## Related docs

- [Contract reference](./smart-wallet-contract.md) — factory and wallet contract API
- [Deployment guide](./deployment.md) — original deployment guide (deploy script)
- [Smart Wallet Integration Guide](../smart-wallet/integration-guide.md) — TypeScript SDK usage
- [REST API Reference](../api/api-reference.md) — `submit-tx` endpoint
