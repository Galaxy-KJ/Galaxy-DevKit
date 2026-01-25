# Wallet — Core Wallet Package

This package provides secure wallet authentication and management features for Galaxy DevKit, including biometric authentication and hardware wallet integration.

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

## 🔐 Hardware Wallet Integration (Ledger)

### Overview

The hardware wallet module provides integration with Ledger devices for maximum security. Private keys never leave the hardware device, and all transactions require physical confirmation.

### Supported Devices

- **Ledger Nano S** - via USB
- **Ledger Nano S Plus** - via USB
- **Ledger Nano X** - via USB or Bluetooth (Bluetooth support coming soon)

### Supported Ledger Apps

- **Stellar App** - Version 3.0.0 or higher recommended
  - Install via Ledger Live
  - Supports: public key retrieval, transaction signing, message signing
  - BIP44 derivation path: `m/44'/148'/account'`

### Installation

The Ledger integration dependencies are included in the wallet auth package:

```bash
cd packages/core/wallet/auth
npm install
```

Dependencies:
- `@ledgerhq/hw-transport` - Base transport layer
- `@ledgerhq/hw-transport-webusb` - WebUSB transport for browsers
- `@ledgerhq/hw-transport-node-hid` - HID transport for Node.js
- `@ledgerhq/hw-app-str` - Stellar app interface
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
import { LedgerWallet, isLedgerSupported, detectLedgerDevices } from './auth/src/hardware';

// 1. Check if Ledger is supported
if (!isLedgerSupported()) {
  throw new Error('Ledger not supported in this environment');
}

// 2. Detect devices
const hasDevices = await detectLedgerDevices();
if (!hasDevices) {
  console.log('No Ledger devices found');
}

// 3. Create and connect
const ledger = new LedgerWallet({
  transport: 'usb',
  timeout: 30000,
  autoReconnect: true,
});

await ledger.connect();

// 4. Get public key
const publicKey = await ledger.getPublicKey("44'/148'/0'");

// 5. Sign transaction
const signature = await ledger.signTransaction(transactionHash);
```

### Usage Examples

#### Connect to Ledger

```typescript
import { LedgerWallet, STELLAR_BIP44_PATH } from './auth/src/hardware';

const ledger = new LedgerWallet({
  transport: 'usb',
  derivationPath: STELLAR_BIP44_PATH, // "44'/148'/0'"
  timeout: 30000, // 30 seconds
  autoReconnect: true,
  maxReconnectAttempts: 3,
});

// Set up event listeners
ledger.on('connected', (deviceInfo) => {
  console.log('Connected:', deviceInfo.firmwareVersion);
});

ledger.on('disconnected', () => {
  console.log('Device disconnected');
});

ledger.on('error', (error) => {
  console.error('Error:', error.message);
});

// Connect
await ledger.connect();
```

#### Get Public Key

```typescript
// Get public key for default account (44'/148'/0')
const publicKey = await ledger.getPublicKey();

// Get public key for specific account
const account5PublicKey = await ledger.getPublicKey("44'/148'/5'");

// Display address on device for verification
const verified = await ledger.displayAddress("44'/148'/0'");
```

#### Sign Transaction

```typescript
import { createHash } from 'crypto';

// Create transaction hash (in real app, use Stellar SDK)
const transactionHash = createHash('sha256')
  .update('transaction-data')
  .digest();

// Sign with Ledger
const result = await ledger.signTransaction(transactionHash, "44'/148'/0'");

console.log('Signature:', result.signature); // 64-byte Buffer
console.log('Public Key:', result.publicKey);
```

#### Multiple Accounts

```typescript
import { buildStellarPath, validateStellarPath } from './auth/src/hardware';

// Get multiple accounts
const accounts = await ledger.getAccounts(0, 5);
// Returns accounts 0-4 with public keys and derivation paths

accounts.forEach(account => {
  console.log(`Account ${account.index}: ${account.publicKey}`);
  console.log(`Path: ${account.derivationPath}`);
});

// Use specific account
const path = buildStellarPath(10); // "44'/148'/10'"
if (validateStellarPath(path)) {
  const publicKey = await ledger.getPublicKey(path);
}
```

#### Error Handling

```typescript
import { LedgerError, parseLedgerError, getSuggestedAction } from './auth/src/hardware';

try {
  await ledger.signTransaction(hash);
} catch (error) {
  const ledgerError = parseLedgerError(error);

  switch (ledgerError.code) {
    case 'DEVICE_NOT_CONNECTED':
      console.log('Please connect your Ledger device');
      break;
    case 'APP_NOT_OPEN':
      console.log('Please open the Stellar app on your device');
      break;
    case 'USER_REJECTED':
      console.log('Transaction rejected on device');
      break;
    case 'CONNECTION_TIMEOUT':
      console.log('Operation timed out');
      break;
    default:
      console.log('Error:', ledgerError.message);
      console.log('Suggestion:', getSuggestedAction(ledgerError));
  }
}
```

### BIP44 Derivation Paths

Stellar uses BIP44 standard with coin type 148:

```
m / purpose' / coin_type' / account' / change / address_index
m / 44'     / 148'       / account' / 0      / 0
```

**Examples:**
- Account 0: `44'/148'/0'` (default)
- Account 1: `44'/148'/1'`
- Account 2: `44'/148'/2'`

**Utilities:**

```typescript
import { buildStellarPath, validateStellarPath, parseBIP44Path } from './auth/src/hardware';

// Build path
const path = buildStellarPath(5); // "44'/148'/5'"

// Validate path
const isValid = validateStellarPath("44'/148'/0'"); // true
const isInvalid = validateStellarPath("44'/60'/0'"); // false (Ethereum coin type)

// Parse path
const parsed = parseBIP44Path("44'/148'/5'");
// { purpose: 44, coinType: 148, account: 5 }
```

### Troubleshooting

#### Device Not Detected

1. **Check USB connection**
   - Use a high-quality USB cable
   - Try different USB ports
   - Avoid USB hubs if possible

2. **Update firmware**
   - Open Ledger Live
   - Go to Manager
   - Update device firmware

3. **Browser compatibility**
   - Chrome/Edge: WebUSB supported
   - Firefox: Not supported (use Node.js)
   - Safari: Not supported

4. **Permissions**
   - Grant USB permissions when prompted
   - Check browser site permissions
   - Try in incognito mode

#### Stellar App Not Open

1. **Open the app**
   - Navigate to Stellar app on device
   - Press both buttons to open

2. **Update the app**
   - Open Ledger Live
   - Go to Manager
   - Update Stellar app

3. **Reinstall if needed**
   - Uninstall via Ledger Live
   - Reinstall Stellar app

#### Transaction Signing Issues

1. **Timeout errors**
   - Increase timeout: `new LedgerWallet({ timeout: 60000 })`
   - Review transaction promptly on device

2. **Invalid transaction**
   - Check transaction hash format
   - Verify transaction data
   - Ensure valid Stellar transaction

3. **User rejection**
   - Review transaction details on device
   - Approve if correct
   - Reject if suspicious

#### Connection Drops

1. **Enable auto-reconnect**
   ```typescript
   const ledger = new LedgerWallet({
     autoReconnect: true,
     maxReconnectAttempts: 3,
   });
   ```

2. **Handle reconnection events**
   ```typescript
   ledger.on('reconnecting', (attempt) => {
     console.log(`Reconnecting... attempt ${attempt}`);
   });

   ledger.on('reconnect-exhausted', () => {
     console.error('Failed to reconnect');
   });
   ```

3. **Check USB power settings**
   - Disable USB selective suspend (Windows)
   - Check USB power management (Mac/Linux)

### Security Best Practices

1. **Verify addresses on device**
   - Always use `displayAddress()` for important accounts
   - Compare address on device screen with displayed address

2. **Review transactions carefully**
   - Check destination address
   - Verify amount
   - Confirm asset type
   - Review memo/notes

3. **Use sequential accounts**
   - Start with account 0
   - Use accounts 1, 2, 3, ... in order
   - Don't skip account numbers

4. **Secure your recovery phrase**
   - Write down 24-word recovery phrase
   - Store in secure location
   - Never share with anyone
   - Never store digitally

5. **Keep firmware updated**
   - Update Ledger firmware regularly
   - Update Stellar app regularly
   - Use official Ledger Live app

6. **Validate derivation paths**
   - Always validate paths before use
   - Only use Stellar coin type (148)
   - Stick to BIP44 standard

### Testing

Tests use mock Ledger transport to simulate hardware without physical device:

```bash
cd packages/core/wallet/auth
npm test
```

Test coverage target: 95%+

Mock usage in tests:
```typescript
import { LedgerWallet } from '../LedgerWallet';

// Mock is automatically used in test environment
const ledger = new LedgerWallet();
await ledger.connect(); // Uses MockLedgerTransport

// Simulate scenarios
mockTransport.simulateUserRejection();
mockTransport.simulateAppNotOpen();
mockTransport.simulateDeviceLocked();
```

### Examples

See comprehensive examples in:
- `docs/examples/wallet/08-ledger-setup.ts` - Device connection and setup
- `docs/examples/wallet/09-ledger-sign.ts` - Transaction signing
- `docs/examples/wallet/10-ledger-accounts.ts` - Multiple account management

### API Reference

**Key Classes:**
- `LedgerWallet` - Main wallet class
- `LedgerError` - Custom error class
- `LedgerConfig` - Configuration interface
- `LedgerAccount` - Account information
- `LedgerSignatureResult` - Signature result

**Key Functions:**
- `isLedgerSupported()` - Check environment support
- `detectLedgerDevices()` - Detect connected devices
- `buildStellarPath(index)` - Build BIP44 path
- `validateStellarPath(path)` - Validate path
- `parseBIP44Path(path)` - Parse path components
- `parseLedgerError(error)` - Parse error
- `getSuggestedAction(error)` - Get error resolution

**Events:**
- `connecting` - Connection initiated
- `connected` - Device connected
- `disconnected` - Device disconnected
- `reconnecting` - Auto-reconnect attempt
- `reconnect-failed` - Reconnect failed
- `reconnect-exhausted` - Max attempts reached
- `error` - Error occurred
- `prompt-user` - User action required
- `public-key-retrieved` - Public key fetched
- `transaction-signed` - Transaction signed
- `hash-signed` - Hash signed
- `accounts-retrieved` - Accounts fetched

### Implementation Files

Core implementation files:
- `auth/src/hardware/LedgerWallet.ts` - Main wallet class
- `auth/src/hardware/types.ts` - Type definitions and utilities
- `auth/src/hardware/ledger-errors.ts` - Error handling
- `auth/src/hardware/index.ts` - Public exports
- `auth/src/hardware/__tests__/LedgerWallet.test.ts` - Test suite
- `auth/src/hardware/__tests__/MockLedgerTransport.ts` - Mock transport

---
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

# Multi-Signature Support

The wallet package includes a robust Multi-Signature coordination system. It allows multiple parties to propose, review, and sign transactions before executing them on the Stellar network.

## Key Features

* Proposal System: Off-chain coordination for on-chain execution.
* Flexible Thresholds: Support for Low, Medium, and High security levels.
* Weight Management: Assign different voting weights to signers.
* Time-outs: Automatic expiration of stale proposals.
* Notifications: Event-driven alerts for signers.

## Quick Setup

```javascript
import { MultiSigWallet } from '@galaxy/core-wallet/multisig';
import { Horizon, Networks } from '@stellar/stellar-sdk';

const server = new Horizon.Server('https://horizon-testnet.stellar.org');

// Initialize Wallet
const wallet = new MultiSigWallet(server, {
  signers: [
    { publicKey: 'GA...', weight: 1, name: 'Alice' },
    { publicKey: 'GB...', weight: 1, name: 'Bob' },
    { publicKey: 'GC...', weight: 2, name: 'Admin' }
  ],
  threshold: {
    masterWeight: 0, // Master key disabled for extra security
    low: 1,
    medium: 2,
    high: 3
  },
  proposalExpirationSeconds: 3600, // 1 hour
  networkPassphrase: Networks.TESTNET
});

// Setup on-chain (One time operation)
await wallet.setupOnChain(sourceSecretKey);
```

## Transaction Lifecycle

### 1. Create Proposal:

```javascript
const proposal = await wallet.proposeTransaction(
  creatorPub,
  xdrString,
  "Monthly Vendor Payment"
);
```

### 2. Sign Proposal:

```javascript
// Signer reviews XDR and signs locally
const signature = keypair.sign(txHash).toString('base64');

// Submit signature to wallet
await wallet.signProposal(proposal.id, signerPub, signature);
```

### 3. Execute:

```javascript
// Anyone can trigger execution once threshold is met
const result = await wallet.executeProposal(proposal.id);
console.log('Tx Hash:', result);
```

Maintained by Galaxy DevKit Team
