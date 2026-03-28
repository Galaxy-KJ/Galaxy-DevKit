# Smart Wallet Integration Guide

This guide shows the full Smart Wallet lifecycle:

1. Register a passkey.
2. Deploy the smart wallet.
3. Create a short-lived session signer.
4. Sign transactions with the session key.
5. Remove the session signer.
6. Send signed XDR to a sponsor service.

## Architecture

For the sequence-level view, see [Smart Wallet Flow](../architecture/smart-wallet-flow.md).

## Prerequisites

- A deployed smart-wallet factory contract.
- A Soroban RPC endpoint.
- A WebAuthn-capable frontend or a custom credential backend.
- A sponsor service that accepts signed XDR and submits it.

## 1. Browser Setup

```ts
import { Networks } from '@stellar/stellar-sdk';
import { WebAuthNProvider } from '@galaxy/core-wallet/auth/providers/WebAuthNProvider';
import { BrowserCredentialBackend } from '@galaxy/core-wallet/credential-backends/browser.backend';
import { SmartWalletService } from '@galaxy/core-wallet/smart-wallet.service';
import { SessionKeyManager } from '@galaxy/core-wallet/auth/session/SessionKeyManager';

const provider = new WebAuthNProvider({ rpId: 'app.example.com' });
const credentialBackend = new BrowserCredentialBackend();

const smartWalletService = new SmartWalletService(
  provider,
  'https://soroban-testnet.stellar.org',
  process.env.FACTORY_CONTRACT_ID,
  Networks.TESTNET,
  credentialBackend
);

const sessionKeyManager = new SessionKeyManager(provider, smartWalletService);
```

## 2. Register Passkey And Deploy Wallet

Your passkey registration flow usually happens outside `SmartWalletService`.
Once you have:
- `credentialId`
- the 65-byte uncompressed public key
- a prepared factory transaction

you can deploy:

```ts
const contractAddress = await smartWalletService.deploy(
  publicKey65Bytes,
  factoryDeployTx
);
```

At this point, you have a deployed smart-wallet contract address and an admin passkey that can authorize contract actions.

## 3. Create A Session Signer

Session keys let you avoid a biometric prompt on every transaction.

```ts
const session = await sessionKeyManager.createSession({
  smartWalletAddress: contractAddress,
  passkeyCredentialId: credentialId,
  ttlSeconds: 3600,
});

console.log(session.publicKey);
console.log(session.expiresAt);
```

What happens internally:
- `SessionKeyManager` generates a fresh Ed25519 keypair in memory.
- It obtains one WebAuthn assertion for the `add_session_signer` flow.
- `SmartWalletService.addSigner()` attaches that assertion to the Soroban auth entry.
- The result is signed fee-less XDR ready for sponsor submission.

## 4. Sign A Transaction With The Session Key

Once the session signer is active on-chain, repeated transactions can use the in-memory session key:

```ts
const signedXdr = await sessionKeyManager.signTransaction(
  sorobanTx,
  contractAddress,
  sessionCredentialId
);
```

This calls `SmartWalletService.signWithSessionKey(...)`, which:
- simulates the Soroban transaction,
- hashes the auth entry,
- calls the session signer callback,
- encodes `AccountSignature::SessionKey(...)`,
- returns signed fee-less XDR.

## 5. Revoke The Session Signer

When the user logs out or wants to revoke delegated access:

```ts
await sessionKeyManager.revoke(contractAddress, credentialId);
```

This removes the signer on-chain and zeroes the in-memory private key locally.

## 6. Submit Through A Sponsor Service

The client should not submit directly if you want fee sponsorship.

```ts
const response = await fetch('/api/submit-soroban-xdr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedTxXdr: signedXdr }),
});

const result = await response.json();
console.log(result.transactionHash);
```

## Node.js / Test Backend Example

For Node.js, tests, or environments without `navigator.credentials`, inject a custom backend:

```ts
import type { CredentialBackend } from '@galaxy/core-wallet/types/smart-wallet.types';

const testCredentialBackend: CredentialBackend = {
  async get() {
    return prebuiltAssertionCredential;
  },
};

const smartWalletService = new SmartWalletService(
  { relyingPartyId: 'localhost' },
  rpcUrl,
  factoryId,
  Networks.TESTNET,
  testCredentialBackend
);
```

This is the intended extension point for:
- Node.js integration tests
- React Native passkey libraries
- HSM-backed assertion adapters
- mocked local development flows

## Common Failure Modes

### No browser credential support

If you instantiate `SmartWalletService` without a custom backend outside the browser, `BrowserCredentialBackend` will throw a descriptive error. Pass a custom `credentialBackend`.

### No auth entries in simulation

If Soroban simulation returns no auth entries, the invocation either:
- does not require authorization, or
- was built incorrectly for the target contract method.

### Invalid session-key signatures

`signWithSessionKey()` requires a 64-byte Ed25519 signature. Any other size is rejected before XDR assembly.

## Recommended Integration Pattern

- Keep passkeys for admin operations only.
- Use session keys for short-lived high-frequency operations.
- Never persist session private keys; keep them in memory only.
- Return signed fee-less XDR to a sponsor service for submission.

## Related Docs

- [API Reference](./api-reference.md)
- [Smart Wallet Flow](../architecture/smart-wallet-flow.md)
