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

## Related Docs

- [Integration Guide](./integration-guide.md)
- [Smart Wallet Flow](../architecture/smart-wallet-flow.md)
- [Wallet Package README](../../packages/core/wallet/README.md)
