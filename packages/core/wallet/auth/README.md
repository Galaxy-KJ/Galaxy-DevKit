# Wallet Authentication (WebAuthn / Passkey)

Galaxy DevKit uses WebAuthn as the root of trust for smart wallet access control.
This package provides the provider implementations used by the smart wallet service.

## Core providers

- `WebAuthNProvider` (browser native WebAuthn)
- `SocialLoginProvider` (OAuth-backed passkey onboarding)

### WebAuthNProvider key features

- Attestation with `navigator.credentials.create`
- Assertion with `navigator.credentials.get`
- Stores credential IDs in `localStorage` under `webauthn_credentials`
- `encryptKey` / `decryptKey` helpers for secure key storage
- `P-256` / `ES256` credential parameters (WebAuthn standard)

### SocialLoginProvider key features

- Bridges OAuth identity with WebAuthn credential onboarding
- `onboard(userId)` registers a passkey and returns `credentialId` + `publicKey`
- `login(userId)` asserts identity with passkey and returns authorized session

## How smart wallet integration works

1. `SmartWalletService.sign()` simulates a transaction to produce an `authEntry`.
2. It computes `authEntryHash = SHA-256(authEntry.toXDR())` and uses this as WebAuthn challenge.
3. WebAuthn assertion is converted to Soroban `AccountSignature::WebAuthn` and attached to the auth entry.
4. The signed XDR is delivered to the fee sponsor and submitted.

## Environment notes

- Browser: native support via `WebAuthNProvider`.
- React Native: requires passkey bridge modules, not part of this package.
- Node.js: only server-side verification for WebAuthn assertions; no direct `navigator.credentials`.

## Testing

See `packages/core/wallet/src/tests/smart-wallet.service.test.ts` for Jest mocks of WebAuthN flows.

## Further reading

- [Social Login Integration Guide](../../../../docs/guides/social-login-integration.md) — OAuth + WebAuthn two-layer model, Supabase onboarding, and security guarantees
- [WebAuthn Integration Guide](../../../../docs/smart-wallet/webauthn-guide.md) — registration/assertion flows, environment compatibility, and testing
