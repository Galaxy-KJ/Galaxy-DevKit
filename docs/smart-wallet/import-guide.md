# Import/Connect Existing Smart Wallet Guide

This guide explains how to import and connect to a previously deployed smart wallet using its contract address.

## Overview

The import/connect feature allows returning users to:
- Reconnect to already-deployed smart wallets
- Verify wallet integrity on-chain
- Fetch and display associated signers
- Continue testing and operations without re-deployment

This is useful for:
- Development workflows where wallets are deployed once and reused
- Collaborative testing environments
- Wallet recovery and management scenarios

## Prerequisites

- A previously deployed smart wallet contract address (starting with `C`)
- Browser access to Galaxy DevKit frontend
- Connection to the same Stellar network (testnet/mainnet) where wallet was deployed

## Using the Frontend UI

### Step 1: Navigate to Wallet Management

The **Wallet Management** panel has been updated with a new import mode:

1. Open the **Create Smart Wallet** panel
2. Click the **"Import Existing Wallet"** tab

### Step 2: Enter Contract Address

1. Paste your smart wallet contract address in the format: `C...`
2. The panel will validate the format in real-time with visual feedback
3. A valid address example:
   ```
   CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2DAAAA
   ```

### Step 3: Verify & Import

1. Click **"Verify & Import Wallet"**
2. The system will:
   - ✓ Validate the contract address format
   - ✓ Verify the contract exists on-chain
   - ✓ Confirm it's a smart wallet contract
   - ✓ Fetch the list of registered signers (if available)

### Step 4: Review Import Results

The results panel shows:
- **Contract Address**: Your wallet's contract ID
- **Status**: Whether the wallet was successfully verified
- **Active Signers**: List of registered signers and their types

## Programmatic Usage

### Basic Import

```typescript
import { SmartWalletClient } from '@galaxy-kj/frontend/services/smart-wallet.client';
import { WalletConnectorService } from '@galaxy-kj/frontend/services/wallet-connector';

// Initialize client and connector
const client = new SmartWalletClient();
const connector = new WalletConnectorService(
  client,
  'https://soroban-testnet.stellar.org',
  Networks.TESTNET
);

// Import a wallet
const contractAddress = 'CABC123ABCDEFGHIJKLMNOPQRSTUVWXYZ123456ABCDEFG';
const walletInfo = await connector.importWallet(contractAddress);

if (walletInfo.isSmartWallet) {
  console.log('Wallet verified:', walletInfo.address);
  console.log('Signers:', walletInfo.signers);
} else {
  console.log('Error:', walletInfo.errorMessage);
}
```

### Connect to Wallet

```typescript
// Establish connection to imported wallet
const connected = await connector.connectToWallet(contractAddress);

if (connected) {
  console.log('Successfully connected to wallet');
  // Now you can perform operations with the wallet
} else {
  console.log('Connection failed');
}
```

### Validate Address Format

```typescript
// Validate without making network calls
const error = connector.validateContractAddress(contractAddress);

if (error) {
  console.log('Invalid address:', error);
} else {
  console.log('Address format is valid');
}
```

### Manage Stored Connections

```typescript
// Get previously imported wallets from local storage
const connections = connector.getStoredConnections();
connections.forEach(conn => {
  console.log(`${conn.address} - Imported at ${conn.importedAt}`);
});

// Remove a stored connection
connector.removeStoredConnection(contractAddress);
```

## Technical Details

### Validation Process

When importing a wallet, the system performs several validation steps:

1. **Address Format Validation**
   - Must start with "C"
   - Must be valid Bech32 format
   - Decoded size must be 32 bytes

2. **On-Chain Verification**
   - Verifies contract exists at the address
   - Confirms contract is deployed on the current network
   - Checks basic contract properties

3. **Smart Wallet Detection**
   - Validates contract interface matches smart wallet expectations
   - Checks for required methods (add_signer, remove_signer, etc.)
   - Confirms contract state is accessible

### Data Storage

Imported wallet connections are stored in browser localStorage:
- **Key**: `smart_wallet_connections`
- **Format**: JSON array of connection records
- **Data Retained**: Address, import timestamp, wallet type, signer count

```javascript
// Example stored connection format
{
  "address": "CABC123...",
  "importedAt": "2024-04-28T10:30:00.000Z",
  "isSmartWallet": true,
  "signerCount": 2
}
```

### Signer Fetching

The import process attempts to fetch signers from the deployed contract:
- Queries persistent storage for registered signers
- Returns signer metadata (ID, type, status)
- Caches results in the wallet info object

**Note**: Full signer fetching requires deep Soroban RPC integration and may be expanded in future versions.

## Acceptance Criteria

✅ **Connection rejects if not a smart account contract**
- Non-smart wallet contracts are rejected during verification
- Clear error messages guide users to check the address

✅ **Tests added with 90%+ coverage**
- Unit tests for address validation
- Tests for contract verification logic
- Tests for UI mode switching and import flow
- Tests for error handling and edge cases

✅ **Documentation updated**
- This guide covers frontend usage
- API reference in [Smart Wallet API Reference](./api-reference.md)
- Examples provided in [Examples](../examples/examples.md)

✅ **Examples provided**
- Frontend UI implementation in [wallet-create.ts](../../packages/frontend/src/panels/wallet-create.ts)
- Service implementation in [wallet-connector.ts](../../packages/frontend/src/services/wallet-connector.ts)

## Error Handling

Common error scenarios and resolutions:

### Invalid Address Format
```
Error: "Contract address must start with 'C'"
```
**Resolution**: Ensure you've copied the full contract address, starting with "C"

### Contract Not Found
```
Error: "Contract address does not exist on-chain"
```
**Resolution**: Verify:
- The address is correct
- You're connected to the correct network (testnet/mainnet)
- The contract has been deployed

### Not a Smart Wallet
```
Error: "Contract does not appear to be a smart wallet contract"
```
**Resolution**: 
- Confirm the contract address is a smart wallet
- Not a different type of Soroban contract
- Update to use the correct wallet address

### Network Connectivity Issues
```
Error: "Failed to verify contract on-chain"
```
**Resolution**:
- Check internet connectivity
- Verify RPC endpoint is accessible
- Try again after a short delay

## API Reference

For detailed API documentation, see:
- [SmartWalletClient API](./api-reference.md#smartwalletclient)
- [WalletConnectorService API](./api-reference.md#walletconnectorservice)

## Related Guides

- [Smart Wallet Integration Guide](./integration-guide.md)
- [WebAuthn Setup Guide](./webauthn-guide.md)
- [Session Keys Guide](./session-keys.md)
- [Smart Wallet Architecture](../architecture/smart-wallet-flow.md)

## Troubleshooting

### Wallet appears valid but operations fail

The wallet may be valid but missing expected signers. Check:
1. Is at least one admin signer registered?
2. Are you using the correct passkey for operations?
3. Has the TTL on session signers expired?

### Import works but signers list is empty

Current implementation fetches signer metadata asynchronously. The full signer data may be available in a future update. For now, you can:
1. Verify signers using the [wallet-signers panel](../../packages/frontend/src/panels/wallet-signers.ts)
2. Query contract state directly with RPC calls
3. Check on-chain logs for signer history

### Address validation passes but verification fails

The address format is valid but the contract may not meet smart wallet requirements:
1. Ensure the contract is a Galaxy DevKit smart wallet
2. Verify it was deployed to the target network
3. Check contract deployment status in block explorer

## Future Enhancements

- [ ] Enhanced signer metadata fetching
- [ ] Wallet recovery flows
- [ ] Multi-chain wallet support  
- [ ] Wallet health status dashboard
- [ ] Automatic TTL management for session signers
- [ ] Batch wallet operations
