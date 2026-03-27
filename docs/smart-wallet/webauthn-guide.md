# WebAuthn / Passkey Integration Guide for Galaxy DevKit

This guide explains how Galaxy DevKit uses WebAuthn passkeys for smart wallet security and how to integrate registration/assertion flows across environments.

## 1. WebAuthn fundamentals

- **Registration (attestation)**: Creates a credential on authenticator device. Produces `credentialId`, `publicKey`, and attestation data.
- **Assertion (authentication)**: Uses an existing credential to prove device possession. Includes `authenticatorData`, `clientDataJSON`, and `signature`.
- **P-256 keys**: Galaxy DevKit uses `ES256` (P-256) for WebAuthn and contract auth payload signing.
- **Challenge**: random or deterministic data hashed and used by `navigator.credentials.get`

## 2. How Galaxy DevKit uses WebAuthn

- Smart wallet auth flow is rooted in **WebAuthn passkeys**.
- In `SmartWalletService`, challenge for assertion is:
  - `authEntryHash = SHA-256(authEntry.toXDR())`
  - `challenge = base64UrlEncode(authEntryHash)`
- Standard flow in `sign()` and `addSigner()`:
  1. Simulate transaction to get `authEntry`.
  2. `authEntry.toXDR()` → hash → challenge.
  3. `navigator.credentials.get({ publicKey: { challenge, rpId, allowCredentials, userVerification: 'required' }})`
  4. Convert assertion to `AccountSignature::WebAuthn` ScVal via `buildWebAuthnSignatureScVal`.
  5. Attach auth to entry and assemble final fee-less XDR.

## 3. Provider setup

### WebAuthNProvider (browser native)

```ts
import { WebAuthNProvider } from 'packages/core/wallet/auth/src/providers/WebAuthNProvider';

const provider = new WebAuthNProvider({
  rpId: 'example.com',
  rpName: 'Galaxy Wallet',
});

await provider.checkAvailability();
```

### SocialLoginProvider (OAuth-backed passkeys)

- Use this in flows where OAuth identifies a user.
- `onboard(userId)` performs WebAuthn registration and returns credential metadata.
- `login(userId)` performs assertion and validates credential.

## 4. Credential ID management

- `WebAuthNProvider` by default stores IDs in `localStorage` under `webauthn_credentials`.
- For production, persist `credentialId` and `publicKey` on server side (e.g., Supabase) and map to user IDs.
- Multi-device: store per device credential IDs.
- Sample retrieval:
  - `provider.getStoredCredentialIds()`
  - fallback to server store of active primary ID.

## 5. Registration and assertion flow (browser example)

### Registration (`navigator.credentials.create`)

```ts
const challenge = crypto.getRandomValues(new Uint8Array(32));

const publicKeyOptions: PublicKeyCredentialCreationOptions = {
  challenge,
  rp: { id: 'example.com', name: 'Galaxy DevKit' },
  user: {
    id: new TextEncoder().encode('user-123'),
    name: 'alice@example.com',
    displayName: 'Alice',
  },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  timeout: 60000,
  authenticatorSelection: { userVerification: 'required', authenticatorAttachment: 'platform' },
  attestation: 'none',
};

const credential = (await navigator.credentials.create({ publicKey: publicKeyOptions })) as PublicKeyCredential;
const credentialId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));

// Persist credentialId and potentially raw public key to server.
```

### Assertion (`navigator.credentials.get` with challenge = SHA-256(authEntry.toXDR()))

```ts
const authEntryHash = await crypto.subtle.digest('SHA-256', authEntryXdrBuffer);
const challenge = Uint8Array.from(new Uint8Array(authEntryHash));

const assertion = (await navigator.credentials.get({
  publicKey: {
    challenge,
    rpId: 'example.com',
    allowCredentials: [{ id: credentialBuffer, type: 'public-key' }],
    userVerification: 'required',
    timeout: 60000,
  },
})) as PublicKeyCredential;

// Process assertion.response.authenticatorData etc.
```

## 6. Environment compatibility matrix

- Browser
  - Full WebAuthn support on modern Chrome/Firefox/Safari/Edge.
  - Works with platform authenticators (Touch ID, Windows Hello, Android system prompt) and passkeys.
- React Native
  - Requires affinity layer such as `react-native-webauthn` or `passkey` package.
  - Usually uses definition of `navigator.credentials` shim or SDK-specific APIs.
  - Some limitations for `rpId` and `attestation` depending on underlying OS.
- Node.js
  - WebAuthn client APIs are not available.
  - Use for server-side verification only (`@simplewebauthn/server`).
  - For full wallet flows, endpoint proxies browser auth from user device; server verifies assertions.

## 7. Testing

- Jest (unit tests)
  - Mock `navigator.credentials.create` / `navigator.credentials.get`.
  - In `packages/core/wallet/src/tests`, `jest.mock()` covers provider methods.

```ts
Object.defineProperty(global.navigator, 'credentials', {
  configurable: true,
  value: {
    create: jest.fn().mockResolvedValue(mockPublicKeyCredential),
    get: jest.fn().mockResolvedValue(mockAssertionCredential),
  },
});
```

- Playwright virtual authenticator
  - Use `page.addInitScript` and `page.context().newCDPSession()` to emulate platform authenticator.
  - `await context.setHTTPCredentials()` for secured origin testing.
  - Use `await page.evaluate` to run WebAuthn flows in browser context.

## 8. Error Handling

- User cancellation: handle `if (!credential) throw new Error('Authentication cancelled');`
- Timeout: `TimeoutError` from `navigator.credentials.get`; show retry UI.
- Hardware unavailable: `NoAvailableAuthenticatorError`; fallback to alternative auth flow (PIN, OTP).
- Invalid assertion: verify server side and show `Invalid credentials.

## 9. Related docs

- `packages/core/wallet/src/smart-wallet.service.ts` (WebAuthn negotiation for sign and addSigner)
- `packages/core/wallet/auth/src/providers/WebAuthNProvider.ts`
- `packages/core/wallet/auth/src/providers/SocialLoginProvider.ts`
- `docs/examples/wallet/17-setup-biometric.ts`
- `packages/core/wallet/src/tests/smart-wallet.service.test.ts`
- [FEATURE] Multi-device Passkey Support (#164)
- [DOCS] Smart Wallet Service API reference (#178)
