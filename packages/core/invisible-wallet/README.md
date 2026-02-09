# @galaxy-kj/core-invisible-wallet

Invisible Wallet System for Galaxy DevKit - Seamless Stellar wallet management with USDC support, path payment swaps, and encrypted backup/restore.

## Overview

The Invisible Wallet provides a user-friendly wallet management system that abstracts away the complexity of handling private keys on the Stellar network. Users can create wallets, swap between XLM and USDC, sign external transactions (Trustless Work, Soroban dApps), and back up their keys with industry-standard encryption.

## Features

- **Wallet Management**: Create, unlock, lock, and manage Stellar wallets
- **XLM / USDC Swaps**: Built-in `swapXlmUsdc()` with pre-configured USDC issuers (testnet & mainnet)
- **Trustline Management**: Add trustlines for any Stellar asset (USDC, EURC, etc.)
- **External Transaction Signing**: Sign XDR transactions from Trustless Work, Soroban dApps, and other services
- **AES-256-GCM Encryption**: Military-grade encryption for private keys
- **Multiple KDF Support**: PBKDF2 and Argon2id for key derivation
- **Multiple Backup Formats**: Encrypted JSON, QR Code, Paper Wallet, Mnemonic
- **Shamir Secret Sharing**: Split backups across multiple parties
- **Session Management**: Time-limited sessions with automatic expiration

## Installation

```bash
npm install @galaxy-kj/core-invisible-wallet
```

## Quick Start

### Creating a Wallet

```typescript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const networkConfig = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

const { wallet, session } = await walletService.createWallet(
  {
    userId: 'user_123',
    email: 'user@example.com',
    network: networkConfig,
  },
  'SecurePassword123!'
);

console.log('Public Key:', wallet.publicKey);
console.log('Session Token:', session.sessionToken);
```

### Swapping XLM to USDC

The `swapXlmUsdc` method uses pre-configured USDC issuers per network, no need to specify asset issuers:

```typescript
// XLM -> USDC
const result = await walletService.swapXlmUsdc(
  wallet.id,
  session.sessionToken,
  'xlm_to_usdc',
  '50',                    // send 50 XLM
  'SecurePassword123!'
);

console.log(`Swapped ${result.inputAmount} XLM -> ${result.outputAmount} USDC`);
console.log(`Price: ${result.price}, Impact: ${result.priceImpact}%`);

// USDC -> XLM
const reverse = await walletService.swapXlmUsdc(
  wallet.id,
  session.sessionToken,
  'usdc_to_xlm',
  '10',                    // send 10 USDC
  'SecurePassword123!',
  2.5                      // optional: max slippage 2.5% (default 1%)
);
```

### Generic Swap (any asset pair)

For swapping between arbitrary assets, use the `swap` method:

```typescript
const result = await walletService.swap(
  wallet.id,
  session.sessionToken,
  {
    sendAssetCode: 'XLM',
    destAssetCode: 'EURC',
    destAssetIssuer: 'GDHU...', // issuer public key
    amount: '100',
    type: 'strict_send',       // or 'strict_receive'
    maxSlippage: 1,            // 1%
  },
  'SecurePassword123!'
);
```

### Adding a Trustline

Before receiving any non-native asset (USDC, EURC, etc.), you need a trustline:

```typescript
await walletService.addTrustline(
  wallet.id,
  session.sessionToken,
  {
    assetCode: 'USDC',
    assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    limit: '10000', // optional
  },
  'SecurePassword123!'
);
```

### Signing External Transactions (Trustless Work, Soroban)

Sign unsigned XDR transactions from external services:

```typescript
// Example: signing a Trustless Work escrow transaction
const { signedXdr, hash } = await walletService.signTransaction(
  wallet.id,
  session.sessionToken,
  unsignedXdr,     // XDR string from useFundEscrow, Soroban, etc.
  'SecurePassword123!'
);

console.log('Signed XDR:', signedXdr);
console.log('Tx Hash:', hash);
```

### Checking Balances

```typescript
const xlmBalance = await walletService.getBalance(wallet.id, 'XLM');
const usdcBalance = await walletService.getBalance(wallet.id, 'USDC');

console.log(`XLM: ${xlmBalance.balance}`);
console.log(`USDC: ${usdcBalance.balance}`);
```

## USDC Configuration

Pre-configured USDC issuers are available via `USDC_CONFIG`:

```typescript
import { USDC_CONFIG } from '@galaxy-kj/core-invisible-wallet';

// Testnet
USDC_CONFIG.testnet.issuer // GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

// Mainnet (Circle)
USDC_CONFIG.mainnet.issuer // GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

## Backup & Restore

### Creating a Wallet Backup

```typescript
import { BackupManager } from '@galaxy-kj/core-invisible-wallet';

const backupManager = new BackupManager();

const backup = await backupManager.createBackup(wallet, 'securePassword', {
  format: 'encrypted-json',
  kdf: 'Argon2',
  label: 'My Primary Wallet Backup'
});

console.log('Backup created:', backup.metadata.checksum);
```

### Restoring from Backup

```typescript
import { RestoreManager } from '@galaxy-kj/core-invisible-wallet';

const restoreManager = new RestoreManager();

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
const shamirBackup = await backupManager.createShamirBackup(wallet, 'password', {
  threshold: 2,
  totalShares: 3
});

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

| Format | Description |
|--------|-------------|
| `encrypted-json` | Primary format with full metadata and checksums |
| `qr-code` | Mobile-friendly format for easy scanning |
| `paper-wallet` | Printable HTML format for cold storage |
| `mnemonic` | BIP39 standard 12/24 word recovery phrase |

## KDF Options

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

## API Reference

### InvisibleWalletService

| Method | Description |
|--------|-------------|
| `createWallet(config, password, deviceInfo?)` | Create a new invisible wallet |
| `createWalletFromMnemonic(config, mnemonic, password, deviceInfo?)` | Import wallet from BIP39 mnemonic |
| `unlockWallet(walletId, password, deviceInfo?)` | Unlock wallet and get session |
| `lockWallet(walletId, sessionToken?)` | Lock wallet / revoke sessions |
| `getBalance(walletId, asset?)` | Get balance for an asset |
| `getAccountInfo(walletId)` | Get full Stellar account info |
| `sendPayment(walletId, sessionToken, params, password)` | Send a payment |
| `addTrustline(walletId, sessionToken, params, password)` | Add asset trustline |
| `swapXlmUsdc(walletId, sessionToken, direction, amount, password, maxSlippage?)` | Swap between XLM and USDC |
| `swap(walletId, sessionToken, params, password)` | Swap any asset pair via path payments |
| `signTransaction(walletId, sessionToken, xdr, password)` | Sign external XDR transaction |
| `getTransactionHistory(walletId, limit?)` | Get transaction history |
| `changePassword(walletId, oldPassword, newPassword)` | Change wallet password |
| `exportBackup(walletId, password)` | Export encrypted backup |

### BackupManager

| Method | Description |
|--------|-------------|
| `createBackup(wallet, password, options)` | Create backup in any format |
| `createEncryptedJsonBackup(data, password, options)` | Create encrypted JSON backup |
| `createShamirBackup(wallet, password, options)` | Create Shamir split backup |
| `validateBackup(backup)` | Validate backup structure |
| `getBackupInfo(backup)` | Get backup metadata |
| `exportBackupAsString(backup)` | Export as JSON string |
| `exportBackupAsBase64(backup)` | Export as Base64 |

### RestoreManager

| Method | Description |
|--------|-------------|
| `restoreFromEncryptedJson(backup, password, options)` | Restore from encrypted JSON |
| `restoreFromShamirShares(shares, password, options)` | Restore from Shamir shares |
| `autoRestore(data, password, options)` | Auto-detect format and restore |

### ShamirManager

| Method | Description |
|--------|-------------|
| `splitSecret(backup, options)` | Split backup into shares |
| `combineShares(shares)` | Reconstruct from shares |
| `validateShare(share)` | Validate a single share |
| `createShareCard(share)` | Create distributable card |
| `parseShareCard(cardData)` | Parse share from card |

## Environment Variables

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Security Considerations

1. **Never store unencrypted private keys**
2. **Use Argon2** for new backups (PBKDF2 for legacy compatibility)
3. **Verify checksums** before restoring
4. **Distribute Shamir shares** to geographically separate locations
5. **Test restoration** before relying on a backup
6. **Use strong passwords** (minimum 8 characters, uppercase, lowercase, numbers)

## License

MIT
