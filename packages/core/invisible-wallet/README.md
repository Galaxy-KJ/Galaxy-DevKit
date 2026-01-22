# @galaxy/core-invisible-wallet

Invisible Wallet System for Galaxy DevKit - Seamless wallet management with enhanced backup/restore encryption.

## Overview

The Invisible Wallet provides a user-friendly wallet management system that abstracts away the complexity of handling private keys. Keys are encrypted with industry-standard encryption and can be backed up in multiple formats.

## Features

- **AES-256-GCM Encryption**: Military-grade encryption for private keys
- **Multiple KDF Support**: PBKDF2 and Argon2id for key derivation
- **Multiple Backup Formats**: Encrypted JSON, QR Code, Paper Wallet, Mnemonic
- **Shamir Secret Sharing**: Split backups across multiple parties
- **Legacy Format Migration**: Automatic migration from older backup formats
- **BIP39 Mnemonic Support**: Standard 12/24 word recovery phrases

## Installation

```bash
npm install @galaxy/core-invisible-wallet
```

## Quick Start

### Creating a Wallet Backup

```typescript
import {
  InvisibleWalletService,
  BackupManager,
  CreateBackupOptions
} from '@galaxy/core-invisible-wallet';

// Create backup manager
const backupManager = new BackupManager();

// Create encrypted JSON backup with Argon2
const backup = await backupManager.createBackup(wallet, 'securePassword', {
  format: 'encrypted-json',
  kdf: 'Argon2',
  label: 'My Primary Wallet Backup'
});

console.log('Backup created:', backup.metadata.checksum);
```

### Restoring from Backup

```typescript
import { RestoreManager } from '@galaxy/core-invisible-wallet';

const restoreManager = new RestoreManager();

// Restore from encrypted backup
const result = await restoreManager.restoreFromEncryptedJson(
  backup,
  'securePassword',
  { validateChecksum: true }
);

if (result.success) {
  console.log('Wallet restored:', result.data.publicKey);
}
```

### Shamir Secret Sharing

Split your backup across multiple trusted parties:

```typescript
import { BackupManager, RestoreManager } from '@galaxy/core-invisible-wallet';

const backupManager = new BackupManager();
const restoreManager = new RestoreManager();

// Create Shamir backup with 2-of-3 threshold
const shamirBackup = await backupManager.createShamirBackup(wallet, 'password', {
  threshold: 2,
  totalShares: 3
});

// Distribute shares to different parties
const shares = backupManager.distributeShares(shamirBackup);
shares.forEach((item, i) => {
  console.log(`Share ${i + 1}:\n${item.instructions}`);
});

// Later: Restore with any 2 shares
const restored = await restoreManager.restoreFromShamirShares(
  [shares[0].share, shares[1].share],
  'password'
);
```

## Backup Formats

### Encrypted JSON (Default)

The primary backup format with full metadata and checksums.

```typescript
const backup = await backupManager.createBackup(wallet, password, {
  format: 'encrypted-json',
  kdf: 'Argon2' // or 'PBKDF2'
});

// Backup structure
interface EncryptedBackup {
  version: string;
  encryptionAlgorithm: 'AES-256-GCM';
  kdf: 'PBKDF2' | 'Argon2';
  kdfParams: { /* salt, iterations, etc */ };
  iv: string;
  authTag: string;
  ciphertext: string;
  metadata: {
    created: string;
    accounts: number;
    checksum: string;
  };
}
```

### QR Code Backup

Mobile-friendly format for easy scanning:

```typescript
const qrBackup = await backupManager.createBackup(wallet, password, {
  format: 'qr-code',
  kdf: 'Argon2',
  qrOptions: {
    size: 300,
    errorCorrectionLevel: 'H'
  }
});

// Use qrBackup.qrDataUrl in an <img> tag
```

### Paper Wallet

Printable HTML format for cold storage:

```typescript
const paperBackup = await backupManager.createBackup(wallet, password, {
  format: 'paper-wallet',
  kdf: 'Argon2',
  paperOptions: {
    includeQR: true,
    includeInstructions: true,
    theme: 'light'
  }
});

// Save paperBackup.html to a file and print
```

### Mnemonic Backup

BIP39 standard recovery phrase:

```typescript
const mnemonicBackup = await backupManager.createBackup(wallet, password, {
  format: 'mnemonic',
  mnemonicStrength: 256 // 24 words
});

// Restore from mnemonic phrase
const restored = await restoreManager.restoreFromMnemonicPhrase(
  'abandon ability able about above absent absorb...',
  0 // account index
);
```

## KDF Options

### PBKDF2 (Compatibility)

```typescript
{
  kdf: 'PBKDF2',
  kdfParams: {
    iterations: 100000,
    keyLength: 32,
    digest: 'sha256'
  }
}
```

### Argon2id (Recommended)

```typescript
{
  kdf: 'Argon2',
  kdfParams: {
    memoryCost: 65536,  // 64 MB
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
    type: 'argon2id'
  }
}
```

## Legacy Migration

Automatically migrate from the old `salt:iv:authTag:ciphertext` format:

```typescript
const restoreManager = new RestoreManager();

// Old format string
const legacyBackup = 'base64salt:base64iv:base64authTag:base64ciphertext';

// Auto-restore with migration
const result = await restoreManager.restoreFromLegacy(
  legacyBackup,
  'oldPassword',
  { migrateFormat: true }
);

if (result.migrated) {
  console.log('Backup migrated from legacy format');
}
```

## Validation

```typescript
import { BackupValidator } from '@galaxy/core-invisible-wallet';

const validator = new BackupValidator();

// Validate backup structure
const validation = validator.validateEncryptedBackup(backup);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// Verify checksum
const checksumValid = validator.validateChecksum(backup);
```

## API Reference

### BackupManager

| Method | Description |
|--------|-------------|
| `createBackup(wallet, password, options)` | Create backup in any format |
| `createEncryptedJsonBackup(data, password, options)` | Create encrypted JSON backup |
| `createQRCodeBackup(data, password, options)` | Create QR code backup |
| `createPaperWalletBackup(data, password, options)` | Create paper wallet |
| `createMnemonicBackup(data, password, options)` | Create mnemonic backup |
| `createShamirBackup(wallet, password, options)` | Create Shamir split backup |
| `validateBackup(backup)` | Validate backup structure |
| `getBackupInfo(backup)` | Get backup metadata |
| `exportBackupAsString(backup)` | Export as JSON string |
| `exportBackupAsBase64(backup)` | Export as Base64 |

### RestoreManager

| Method | Description |
|--------|-------------|
| `restoreFromEncryptedJson(backup, password, options)` | Restore from encrypted JSON |
| `restoreFromQRCode(backup, password, options)` | Restore from QR backup |
| `restoreFromPaperWallet(backup, password, options)` | Restore from paper wallet |
| `restoreFromMnemonic(backup, password, options)` | Restore from mnemonic backup |
| `restoreFromMnemonicPhrase(mnemonic, accountIndex)` | Restore from raw mnemonic |
| `restoreFromShamirShares(shares, password, options)` | Restore from Shamir shares |
| `restoreFromLegacy(data, password, options)` | Restore from legacy format |
| `autoRestore(data, password, options)` | Auto-detect and restore |

### ShamirManager

| Method | Description |
|--------|-------------|
| `splitSecret(backup, options)` | Split backup into shares |
| `combineShares(shares)` | Reconstruct from shares |
| `validateShare(share)` | Validate a single share |
| `createShareCard(share)` | Create distributable card |
| `parseShareCard(cardData)` | Parse share from card |

## Security Considerations

1. **Never store unencrypted private keys**
2. **Use Argon2** for new backups (PBKDF2 for legacy compatibility)
3. **Verify checksums** before restoring
4. **Distribute Shamir shares** to geographically separate locations
5. **Test restoration** before relying on a backup
6. **Use strong passwords** (minimum 16 characters recommended)

## License

MIT
