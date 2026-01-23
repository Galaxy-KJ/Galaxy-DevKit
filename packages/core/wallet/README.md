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

## Social Recovery System

The wallet package includes a comprehensive social recovery system that allows users to recover wallet access through trusted guardians if they lose their primary credentials.

### Key Features

- **Guardian Management**: Add, remove, and verify recovery guardians
- **Multi-Signature Recovery**: Uses Stellar's native multi-sig for secure recovery
- **Time-Lock Mechanism**: Configurable delay (default: 48 hours) before execution
- **Fraud Detection**: Risk scoring and fraud indicator detection
- **Notification System**: Alerts for guardians and wallet owner
- **Emergency Contacts**: Additional recovery contacts
- **Recovery Testing**: Dry-run mode for testing without network execution

### Quick Setup

```typescript
import { SocialRecovery } from '@galaxy/core-wallet/recovery';
import { Server, Networks } from '@stellar/stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');
const encryptionKey = 'your-secure-encryption-key-32-chars-long!!';

const recovery = new SocialRecovery(
  {
    guardians: [
      { publicKey: 'G...', name: 'Guardian 1' },
      { publicKey: 'G...', name: 'Guardian 2' },
      { publicKey: 'G...', name: 'Guardian 3' },
    ],
    threshold: 2, // Need 2 out of 3 guardians
    timeLockHours: 48,
    enableTesting: true,
  },
  server,
  Networks.TESTNET,
  encryptionKey
);
```

### Guardian Management

```typescript
// Add a guardian
await recovery.addGuardian(
  guardianPublicKey,
  'Guardian Name',
  'guardian@example.com' // Encrypted
);

// Verify a guardian
await recovery.verifyGuardian(guardianPublicKey);

// Remove a guardian
await recovery.removeGuardian(guardianPublicKey);
```

### Recovery Process

```typescript
// 1. Initiate recovery
const request = await recovery.initiateRecovery(
  walletPublicKey,
  newOwnerPublicKey
);

// 2. Guardians approve
await recovery.guardianApprove(
  request.id,
  guardianPublicKey,
  guardianSecretKey
);

// 3. Complete recovery (after time-lock expires)
const result = await recovery.completeRecovery(
  request.id,
  currentOwnerSecretKey
);
```

### Recovery Testing

```typescript
// Run dry-run test
const testResult = await recovery.testRecovery(
  walletPublicKey,
  newOwnerPublicKey
);
```

### Security Recommendations

1. **Guardian Selection**:
   - Minimum 3 guardians recommended
   - Choose diverse set: family, friends, trusted contacts
   - Select active people who will respond promptly
   - Ensure guardians understand the recovery process

2. **Threshold Configuration**:
   - Default: 60% of guardians (e.g., 2 out of 3, 3 out of 5)
   - Balance between security and accessibility
   - Consider your specific use case

3. **Time-Lock Settings**:
   - Default: 48 hours
   - Gives owner time to cancel if recovery is unauthorized
   - Adjust based on your security requirements

4. **Guardian Verification**:
   - Always verify guardians after adding
   - Regularly check guardian status
   - Remove inactive guardians

### Examples

See the following example files for detailed usage:

- `docs/examples/wallet/14-setup-social-recovery.ts` - Setup guardians and configuration
- `docs/examples/wallet/15-initiate-recovery.ts` - Initiate and manage recovery
- `docs/examples/wallet/16-guardian-approve.ts` - Guardian approval workflow

### Key Files

- `packages/core/wallet/src/recovery/SocialRecovery.ts` - Main recovery class
- `packages/core/wallet/src/recovery/types.ts` - Type definitions
- `packages/core/wallet/src/recovery/NotificationService.ts` - Notification handling
- `packages/core/wallet/src/recovery/__tests__/` - Comprehensive test suite

---

Maintained by Galaxy DevKit Team
