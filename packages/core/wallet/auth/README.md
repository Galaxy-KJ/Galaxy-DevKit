# Wallet Authentication (`@galaxy/core-wallet/auth`)

This package provides the authentication primitives used by Galaxy DevKit smart wallets. It covers WebAuthn passkey providers, session key management, and hardware wallet integration.

## Packages at a Glance

| Module | Path | Purpose |
|---|---|---|
| `SessionKeyManager` | `src/session/SessionKeyManager.ts` | Short-lived Ed25519 delegate signers for high-frequency Soroban operations |
| `WebAuthNProvider` | `src/providers/WebAuthNProvider.ts` | Browser-native WebAuthn (passkey) provider |
| `SocialLoginProvider` | `src/providers/SocialLoginProvider.ts` | OAuth-backed passkey onboarding |
| `BiometricAuth` | `src/BiometricAuth.ts` | High-level biometric enrollment and authentication |
| `LedgerWallet` | `src/hardware/LedgerWallet.ts` | Ledger hardware wallet integration |

---

## SessionKeyManager

`SessionKeyManager` manages short-lived Ed25519 session keys that act as temporary delegates on a Soroban smart wallet. A single biometric prompt at session creation authorizes all subsequent transactions for the session duration — no repeated passkey prompts.

### Quick Start

```ts
import { SessionKeyManager } from '@galaxy/core-wallet/auth/session/SessionKeyManager';
import { WebAuthNProvider } from '@galaxy/core-wallet/auth/providers/WebAuthNProvider';
import { SmartWalletService } from '@galaxy/core-wallet/smart-wallet.service';

const provider = new WebAuthNProvider({ rpId: 'app.example.com' });
const sessionKeyManager = new SessionKeyManager(provider, smartWalletService);

// One biometric prompt — registers session signer on-chain
const session = await sessionKeyManager.createSession({
  smartWalletAddress: contractAddress,
  passkeyCredentialId: storedCredentialId,
  ttlSeconds: 3600,
});

// Sign transactions silently (no biometric)
const signedXdr = await sessionKeyManager.signTransaction(sorobanTx, contractAddress);

// Revoke on logout
await sessionKeyManager.revoke(contractAddress, storedCredentialId);
```

### Session Lifecycle

```
createSession() → [one biometric prompt] → on-chain registration
     ↓
signTransaction() × N  (no prompts — in-memory Ed25519 key)
     ↓
revoke() → [one biometric prompt] → on-chain removal + key zeroed
     OR
TTL expiry → on-chain entry auto-removed by Soroban ledger
```

### Key Security Properties

- The Ed25519 private key lives **only in memory** — never written to localStorage, sessionStorage, IndexedDB, or any persistent store.
- The private key buffer is zeroed with `Buffer.fill(0)` on `revoke()` and on any error path during `createSession()`.
- A fresh keypair is generated on every `createSession()` call.
- The WebAuthn challenge is derived deterministically from the operation parameters, binding the assertion to this specific `add_session_signer` invocation.

### API Summary

| Method | Description |
|---|---|
| `createSession(options)` | Generate keypair, obtain one WebAuthn assertion, register signer on-chain |
| `signTransaction(tx, contractAddress, credentialId?)` | Sign a Soroban tx with the in-memory session key |
| `revoke(walletAddress, passkeyCredentialId)` | Zero key from memory and remove signer on-chain |
| `isActive()` | Returns `true` if an unexpired session is held in memory |
| `sign(txHash)` | Low-level: sign a 32-byte hash with the session key |

For the full guide including TTL strategy, on-chain vs in-memory state, and error handling, see [docs/smart-wallet/session-keys.md](../../../../docs/smart-wallet/session-keys.md).

---

## WebAuthn Providers

### WebAuthNProvider (browser native)

```ts
import { WebAuthNProvider } from '@galaxy/core-wallet/auth/providers/WebAuthNProvider';

const provider = new WebAuthNProvider({ rpId: 'app.example.com' });
await provider.checkAvailability();
```

Key features:
- Attestation via `navigator.credentials.create`
- Assertion via `navigator.credentials.get`
- Stores credential IDs in `localStorage` under `webauthn_credentials`
- `encryptKey` / `decryptKey` helpers for secure key storage
- `P-256` / `ES256` credential parameters (WebAuthn standard)

### SocialLoginProvider (OAuth-backed passkeys)

- Bridges OAuth identity with WebAuthn credential onboarding.
- `onboard(userId)` registers a passkey and returns `credentialId` + `publicKey`.
- `login(userId)` asserts identity with passkey and returns an authorized session.

---

## How Smart Wallet Auth Works

### Admin signing (passkey)

1. `SmartWalletService.sign()` simulates a transaction to produce an `authEntry`.
2. It computes `authEntryHash = SHA-256(authEntry.toXDR())` and uses this as the WebAuthn challenge.
3. The WebAuthn assertion is converted to Soroban `AccountSignature::WebAuthn` and attached to the auth entry.
4. The signed fee-less XDR is delivered to the fee sponsor for submission.

### Session key signing (no biometric)

1. `SessionKeyManager.createSession()` registers a short-lived Ed25519 key on-chain (one biometric prompt).
2. `SessionKeyManager.signTransaction()` delegates to `SmartWalletService.signWithSessionKey()`.
3. The service simulates the tx, computes the auth-entry hash, calls the in-memory sign callback, builds `AccountSignature::SessionKey(...)`, and returns fee-less XDR.

---

## Environment Notes

- **Browser**: Full support via `WebAuthNProvider` and `BrowserCredentialBackend`.
- **React Native**: Requires a passkey bridge module; inject a custom `CredentialBackend`.
- **Node.js**: No `navigator.credentials` — use a custom `CredentialBackend` for tests and server-side flows.

---

## Testing

See `packages/core/wallet/src/tests/smart-wallet.service.test.ts` for Jest mocks of WebAuthN flows.

## Further reading

- [Social Login Integration Guide](../../../../docs/guides/social-login-integration.md) — OAuth + WebAuthn two-layer model, Supabase onboarding, and security guarantees
- [WebAuthn Integration Guide](../../../../docs/smart-wallet/webauthn-guide.md) — registration/assertion flows, environment compatibility, and testing
```bash
cd packages/core/wallet/auth
npm test
```

See `packages/core/wallet/src/tests/smart-wallet.service.test.ts` for Jest mocks of WebAuthn flows.

For Node.js / test environments, inject a custom credential backend:

```ts
const testCredentialBackend = {
  async get() { return prebuiltAssertionCredential; },
};
```

---

## Related Docs

- [Session Key Lifecycle Guide](../../../../docs/smart-wallet/session-keys.md)
- [SmartWalletService API Reference](../../../../docs/smart-wallet/api-reference.md)
- [WebAuthn / Passkey Guide](../../../../docs/smart-wallet/webauthn-guide.md)
- [Architecture Overview](../../../../docs/architecture/architecture.md)
