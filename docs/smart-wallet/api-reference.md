# Smart Wallet API Reference

`SmartWalletService` is the signing bridge between Galaxy DevKit passkeys/session keys and Soroban smart-wallet contracts.

It does three things:
- Builds Soroban invocation transactions for wallet-management operations.
- Simulates those transactions to obtain Soroban auth entries.
- Attaches either a WebAuthn signature or a session-key signature and returns fee-less XDR for sponsor-side submission.

## When To Use It

Use `SmartWalletService` when your app needs:
- Passkey-based admin signing for a Soroban smart wallet.
- Short-lived session keys for repeated actions without repeated biometric prompts.
- A fee sponsorship flow where the client signs auth, but another service submits and pays fees.

If you only need standard Stellar account payments, use the core Stellar SDK instead.

## Constructor

```ts
import { Networks } from '@stellar/stellar-sdk';
import { SmartWalletService } from '@galaxy/core-wallet/smart-wallet.service';
import { WebAuthNProvider } from '@galaxy/core-wallet/auth/providers/WebAuthNProvider';
import { BrowserCredentialBackend } from '@galaxy/core-wallet/credential-backends/browser.backend';

const provider = new WebAuthNProvider({ rpId: 'app.example.com' });
const credentialBackend = new BrowserCredentialBackend();

const service = new SmartWalletService(
  provider,
  'https://soroban-testnet.stellar.org',
  'CFACTORY...',
  Networks.TESTNET,
  credentialBackend
);
```

### Parameters

1. `webAuthnProvider`
   Must expose `relyingPartyId`. `WebAuthNProvider` now does this directly.
2. `rpcUrl`
   Soroban RPC endpoint.
3. `factoryId?`
   Optional factory contract address. Defaults to the repo’s configured testnet factory.
4. `network?`
   Network passphrase. Defaults to `Networks.TESTNET`.
5. `credentialBackend?`
   Optional backend implementing:

```ts
interface CredentialBackend {
  get(options: CredentialRequestOptions): Promise<PublicKeyCredential | null>;
  create?(
    options: CredentialCreationOptions
  ): Promise<PublicKeyCredential | null>;
}
```

If omitted, `SmartWalletService` uses `BrowserCredentialBackend`, which wraps `navigator.credentials`.

## Method Reference

### `ttlSecondsToLedgers(ttlSeconds)`

Converts wall-clock seconds to Soroban-ledger TTL.

```ts
ttlSecondsToLedgers(3600); // 720
```

Notes:
- Assumes 5 seconds per ledger.
- Rounds up, so the signer never expires earlier than requested.

### `deploy(publicKey65Bytes, factoryTx)`

Simulates a factory deployment transaction and extracts the contract address from the return value.

```ts
const contractAddress = await service.deploy(publicKey65Bytes, factoryTx);
```

Inputs:
- `publicKey65Bytes: Uint8Array`
- `factoryTx: Transaction`

Returns:
- `Promise<string>` with the deployed smart-wallet contract address.

Throws when:
- Soroban simulation fails.
- The simulation result does not contain a contract address.

### `sign(contractAddress, sorobanTx, credentialId)`

Signs a Soroban invocation using an admin WebAuthn credential.

```ts
const signedXdr = await service.sign(
  contractAddress,
  transaction,
  credentialId
);
```

Inputs:
- `contractAddress: string`
- `sorobanTx: Transaction`
- `credentialId: string`

Returns:
- `Promise<string>` containing signed fee-less XDR.

Flow:
1. Simulate transaction.
2. Hash auth entry.
3. Request a WebAuthn assertion from `credentialBackend.get(...)`.
4. Attach `AccountSignature::WebAuthn(...)`.
5. Assemble XDR.

### `addSigner(params)`

Registers a short-lived session signer on-chain.

```ts
const signedXdr = await service.addSigner({
  walletAddress: contractAddress,
  sessionPublicKey,
  ttlSeconds: 3600,
  credentialId,
});
```

Inputs:
- `walletAddress: string`
- `sessionPublicKey: string`
- `ttlSeconds: number`
- `credentialId?: string`
- `webAuthnAssertion?: PublicKeyCredential`

Returns:
- `Promise<string>` containing signed fee-less XDR.

Notes:
- Provide `webAuthnAssertion` when the caller already performed the biometric prompt.
- Otherwise, provide `credentialId` and let the service fetch the assertion through the credential backend.

### `removeSigner(params)`

Builds and signs a `remove_signer` invocation.

```ts
const signedXdr = await service.removeSigner({
  walletAddress: contractAddress,
  signerPublicKey: sessionPublicKey,
  credentialId,
});
```

Inputs:
- `walletAddress: string`
- `signerPublicKey?: string`
- `credentialId?: string`
- `webAuthnAssertion?: PublicKeyCredential`

Returns:
- `Promise<string>` containing signed fee-less XDR.

Notes:
- `signerPublicKey` is accepted for higher-level caller context, but the contract removal call is keyed by credential ID.
- Like `addSigner`, this can consume a pre-obtained `webAuthnAssertion`.

### `signWithSessionKey(contractAddress, sorobanTx, credentialId, signFn)`

Signs a Soroban invocation with a delegated session key instead of a passkey.

```ts
const signedXdr = await service.signWithSessionKey(
  contractAddress,
  transaction,
  sessionCredentialId,
  (authEntryHash) => sessionKeypair.sign(authEntryHash)
);
```

Inputs:
- `contractAddress: string`
- `sorobanTx: Transaction`
- `credentialId: string`
- `signFn: (authEntryHash: Buffer) => Buffer`

Returns:
- `Promise<string>` containing signed fee-less XDR.

Requirements:
- `signFn` must return a 64-byte Ed25519 signature.
- The caller is responsible for keeping the session private key in memory only.

## Error Handling

The service currently throws `Error` with descriptive messages. Common cases:

### Validation errors
- `addSigner: walletAddress is required`
- `addSigner: sessionPublicKey is required`
- `addSigner: ttlSeconds must be positive`
- `removeSigner: walletAddress is required`
- `signWithSessionKey: contractAddress is required`
- `signWithSessionKey: credentialId is required`

### Credential / WebAuthn errors
- `WebAuthn authentication was cancelled or timed out.`
- `SmartWalletService expected an AuthenticatorAssertionResponse from the credential backend.`
- `BrowserCredentialBackend requires navigator.credentials...`

### Soroban simulation errors
- `Simulation failed: ...`
- `addSigner simulation failed: ...`
- `removeSigner simulation failed: ...`
- `signWithSessionKey simulation failed: ...`
- `... returned no auth entries.`

### Session-key signing errors
- `signWithSessionKey: signFn must return a 64-byte Ed25519 signature`

## Fee Sponsorship Pattern

Every signing method returns XDR instead of submitting the transaction directly.

That is intentional:
- The client owns credentials and signs auth.
- A sponsor service can review, fee-bump, submit, and monitor the transaction.
- The wallet user does not need native tokens to pay Soroban fees.

Typical flow:
1. Client builds signed fee-less XDR with `SmartWalletService`.
2. Client posts XDR to a backend sponsor endpoint.
3. Backend wraps or submits the transaction.
4. Backend returns transaction hash and execution status.

## WalletConnectorService API

`WalletConnectorService` provides utilities to import and connect to existing smart wallets by their contract address.

### Constructor

```ts
import { SmartWalletClient } from '@galaxy-kj/frontend/services/smart-wallet.client';
import { WalletConnectorService } from '@galaxy-kj/frontend/services/wallet-connector';

const client = new SmartWalletClient();
const connector = new WalletConnectorService(
  client,
  'https://soroban-testnet.stellar.org',
  Networks.TESTNET
);
```

### Methods

#### `validateContractAddress(address: string): string | undefined`

Validates a contract address format without making network calls.

**Parameters:**
- `address`: The contract address to validate (must start with "C")

**Returns:**
- `undefined` if address is valid
- Error message string if invalid

**Example:**
```ts
const error = connector.validateContractAddress('CABC123...');
if (error) {
  console.log('Invalid:', error);
}
```

#### `verifyContractExists(contractAddress: string): Promise<boolean>`

Verifies if a contract address exists on-chain.

**Parameters:**
- `contractAddress`: The contract address to verify

**Returns:**
- `true` if contract exists on the network
- `false` if contract not found or invalid format

**Example:**
```ts
const exists = await connector.verifyContractExists('CABC123...');
if (exists) {
  console.log('Contract found on-chain');
}
```

#### `isSmartWalletContract(contractAddress: string): Promise<boolean>`

Determines if a contract is a smart wallet contract.

**Parameters:**
- `contractAddress`: The contract address to check

**Returns:**
- `true` if contract appears to be a smart wallet
- `false` otherwise

**Example:**
```ts
const isWallet = await connector.isSmartWalletContract('CABC123...');
if (isWallet) {
  console.log('Contract is a smart wallet');
}
```

#### `importWallet(contractAddress: string): Promise<ImportedWalletInfo>`

Imports an existing smart wallet by address with full verification.

**Parameters:**
- `contractAddress`: The contract address to import

**Returns:**
```ts
interface ImportedWalletInfo {
  address: string;           // The contract address
  isValid: boolean;          // Address format is valid
  isSmartWallet: boolean;    // Contract is a smart wallet
  signers: WalletSigner[];   // Registered signers
  errorMessage?: string;     // Error details if any
}

interface WalletSigner {
  id: string;                // Signer identifier
  type: 'admin' | 'session' | 'unknown';
  publicKey?: string;        // Base64 public key if available
  isActive: boolean;         // Whether signer is currently active
}
```

**Example:**
```ts
const walletInfo = await connector.importWallet('CABC123...');

if (walletInfo.isSmartWallet) {
  console.log('Wallet verified:', walletInfo.address);
  console.log('Signers:', walletInfo.signers);
} else {
  console.log('Error:', walletInfo.errorMessage);
}
```

#### `connectToWallet(contractAddress: string): Promise<boolean>`

Establishes a connection to an existing wallet for operations.

**Parameters:**
- `contractAddress`: Smart wallet contract address

**Returns:**
- `true` if connection successful
- `false` if connection failed

**Example:**
```ts
const connected = await connector.connectToWallet('CABC123...');
if (connected) {
  console.log('Ready to perform wallet operations');
}
```

#### `fetchSigners(contractAddress: string): Promise<WalletSigner[]>`

Fetches the list of signers registered on a smart wallet.

**Parameters:**
- `contractAddress`: Smart wallet contract address

**Returns:**
- Array of `WalletSigner` objects

**Example:**
```ts
const signers = await connector.fetchSigners('CABC123...');
signers.forEach(signer => {
  console.log(`${signer.type}: ${signer.id} (${signer.isActive ? 'active' : 'inactive'})`);
});
```

#### `getStoredConnections(): Array<StoredConnection>`

Retrieves previously imported wallets from local storage.

**Returns:**
```ts
interface StoredConnection {
  address: string;           // Contract address
  importedAt: string;        // ISO timestamp of import
  isSmartWallet: boolean;    // Was verified as smart wallet
  signerCount: number;       // Number of signers at import time
}
```

**Example:**
```ts
const connections = connector.getStoredConnections();
connections.forEach(conn => {
  console.log(`${conn.address} - Imported at ${conn.importedAt}`);
});
```

#### `removeStoredConnection(contractAddress: string): void`

Removes a wallet from the stored connections list.

**Parameters:**
- `contractAddress`: The contract address to remove

**Example:**
```ts
connector.removeStoredConnection('CABC123...');
```

### Error Scenarios

The `ImportedWalletInfo.errorMessage` will contain details for:
- Invalid address format
- Contract not found on-chain
- Contract is not a smart wallet
- Network connectivity issues
- On-chain verification failures

## Related Docs

- [Import/Connect Guide](./import-guide.md)
- [Integration Guide](./integration-guide.md)
- [Smart Wallet Flow](../architecture/smart-wallet-flow.md)
- [Wallet Package README](../../packages/core/wallet/README.md)
