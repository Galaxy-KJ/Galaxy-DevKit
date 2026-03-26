#!/bin/bash
set -e

# Configuration
NETWORK="testnet"
SOURCE="deployer"

# WASM paths
WALLET_WASM="target/wasm32v1-none/release/smart_wallet_account_wallet.wasm"
FACTORY_WASM="target/wasm32v1-none/release/smart_wallet_account_factory.wasm"

# Navigate to the contract root (where Cargo.toml is)
cd "$(dirname "$0")/.."

echo "Building contracts..."
stellar contract build

echo "-----------------------------------"
echo "Installing Wallet WASM..."
# Capture only the hash from the output
WALLET_WASM_HASH=$(stellar contract install \
  --wasm "$WALLET_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks)

echo "Wallet WASM Hash: $WALLET_WASM_HASH"

echo "-----------------------------------"
echo "Deploying Factory contract..."
FACTORY_ID=$(stellar contract deploy \
  --wasm "$FACTORY_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  --ignore-checks)

echo "Factory Contract ID: $FACTORY_ID"

echo "-----------------------------------"
echo "Initializing Factory..."
stellar contract invoke \
  --id "$FACTORY_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- init --wallet_wasm_hash "$WALLET_WASM_HASH"

echo "-----------------------------------"
echo "Deployment Complete!"
echo "FACTORY_CONTRACT_ID=$FACTORY_ID"
echo "WALLET_WASM_HASH=$WALLET_WASM_HASH"
echo "-----------------------------------"
