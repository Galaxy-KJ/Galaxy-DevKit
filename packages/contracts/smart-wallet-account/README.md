# Smart Wallet Account Contracts

Soroban-based smart wallet with WebAuthn (passkey) support.

## Deployed Contracts (Testnet)

| Contract | Identifier |
|----------|------------|
| **Factory** | `CAX5RLKVBMYLASX546TKXCZIQSROJGQ7DUIH3LUDG3PR4UB3RRW5O5PE` |
| **Wallet WASM Hash** | `0a5aa83a09dd19985275a643fc1198c6e593569a74005f052c00ea124566998e` |

## Project Structure

This package is organized as a workspace with the following crates:

- `contracts/common`: Shared types and error definitions.
- `contracts/factory`: The factory contract used to deploy deterministic smart wallets.
- `contracts/wallet`: The core smart wallet account implementation.

## Build

To build both contracts:

```bash
stellar contract build
```

## Deploy

Use the provided deployment script to deploy to testnet:

```bash
./scripts/deploy.sh
```

The script builds the contracts, installs the Wallet WASM, deploys the Factory, and initializes it.
