# Wallet — Biometric Authentication (Overview)

This README summarizes the biometric authentication pattern implemented in the wallet package and provides a quick setup/usage guide.

## Summary

The wallet `auth` module provides biometric authentication primitives used by the Invisible Wallet system. Key components:

- `BiometricAuth` (`packages/core/wallet/auth/src/BiometricAuth.ts`) — High-level class that manages enrollment, authentication flows, credential metadata, encrypted key storage, and fallback handling.
- `BiometricAuthProvider` — Abstract provider interface implemented by platform-specific providers.
- `WebAuthNProvider` (`packages/core/wallet/auth/src/providers/WebAuthNProvider.ts`) — WebAuthn-based implementation for browsers.
- `MockBiometricProvider` (`packages/core/wallet/auth/src/providers/MockProvider.ts`) — Local testing provider used in unit tests.

## Quick Setup

1. Install dependencies and build the package.

2. Example usage (WebAuthn provider):

```ts
import { BiometricAuth } from './auth/src/BiometricAuth';
import { WebAuthNProvider } from './auth/src/providers/WebAuthNProvider';

const provider = new WebAuthNProvider({
  /* provider-specific options */
});
const biometric = new BiometricAuth(provider, {
  biometricType: 'any',
  fallbackAuth: 'pin',
});

await biometric.initialize();
const credential = await biometric.enroll('fingerprint');

// Store an encrypted key protected by biometric auth
await biometric.storeEncryptedKey(encryptedKeyHex, 'wallet-main-key');

// Retrieve later
const key = await biometric.retrieveEncryptedKey('wallet-main-key');
```

## Tests & Examples

- Unit tests: `packages/core/wallet/auth/src/tests/BiometricAuth.test.ts`
- Mock provider for local development: `packages/core/wallet/auth/src/providers/MockProvider.ts`

## Notes

- The `BiometricAuth` flow emits events for `initialized`, `enrolled`, `authenticated`, `failed-attempt`, `locked`, `unlocked`, and `fallback-required`.
- For platforms without biometric hardware, a fallback (`pin` or `password`) is used; ensure UI flows support fallback UX.
- To raise docstring coverage, add/expand TSDoc comments in the listed source files.

---

Maintained by Galaxy DevKit Team
