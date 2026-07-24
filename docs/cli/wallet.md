# Wallet Management Commands

Complete guide to managing Stellar wallets using the Galaxy CLI.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Commands](#commands)
  - [Create Wallet](#create-wallet)
  - [Import Wallet](#import-wallet)
  - [List Wallets](#list-wallets)
  - [Wallet Info](#wallet-info)
  - [Fund Testnet Wallet](#fund-testnet-wallet)
  - [Balance](#balance)
  - [Send](#send)
  - [Encrypt Existing Wallet](#encrypt-existing-wallet)
  - [Multi-Signature Wallets](#multi-signature-wallets)
  - [Ledger Hardware Wallet](#ledger-hardware-wallet)
  - [Biometric Authentication](#biometric-authentication)
  - [Social Recovery](#social-recovery)
  - [Backup and Restore](#backup-and-restore)
- [Storage and Security](#storage-and-security)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The Galaxy CLI provides comprehensive wallet management capabilities for Stellar blockchain applications. All wallet commands support both testnet and mainnet networks, with interactive prompts for missing parameters and JSON output for automation.

## Installation

The wallet commands are included with the Galaxy CLI:

```bash
npm install -g @galaxy/cli
```

Or use in a project:

```bash
npm install --save-dev @galaxy/cli
```

## Quick Start

Create your first wallet:

```bash
# Create a new encrypted testnet wallet
galaxy wallet create --name my-wallet --testnet

# List all wallets
galaxy wallet list

# Import an existing wallet
galaxy wallet import <SECRET_KEY> --name imported-wallet
```

## Commands

### Create Wallet

Create a new Stellar wallet with a randomly generated keypair.

**Syntax:**
```bash
galaxy wallet create [options]
```

**Options:**
- `-n, --name <name>` - Wallet name (will prompt if not provided)
- `--testnet` - Use Stellar testnet (default)
- `--mainnet` - Use Stellar mainnet
- `--no-encrypt` - Store the secret key as plaintext (not recommended)
- `--password <password>` - Password for encryption, or set `GALAXY_WALLET_PASSWORD` (required in `--json` mode unless `--no-encrypt` is set)
- `--json` - Output result as JSON

**Examples:**

```bash
# Interactive creation (prompts for name)
galaxy wallet create

# Create with specific name
galaxy wallet create --name my-wallet

# Create with encrypted-at-rest secret (default; prompts for password)
galaxy wallet create --name vault

# Same, non-interactive
galaxy wallet create --name vault --password "correcthorsebattery" --json

# Create mainnet wallet
galaxy wallet create --name prod-wallet --mainnet

# Plaintext local wallet for disposable development only
galaxy wallet create --name scratch --testnet --no-encrypt

# Create with JSON output
galaxy wallet create --name api-wallet --json
```

**JSON Output:**
```json
{
  "success": true,
  "name": "my-wallet",
  "publicKey": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "network": "testnet",
  "encrypted": true,
  "createdAt": "2024-01-29T10:30:00.000Z",
  "path": "/home/user/.galaxy/wallets/my-wallet.json"
}
```

---

### Import Wallet

Import an existing wallet using its secret key.

**Syntax:**
```bash
galaxy wallet import [secret-key] [options]
```

**Arguments:**
- `secret-key` - Stellar secret key (will prompt if not provided)

**Options:**
- `-n, --name <name>` - Wallet name (will prompt if not provided)
- `--testnet` - Use Stellar testnet (default)
- `--mainnet` - Use Stellar mainnet
- `--no-encrypt` - Store the secret key as plaintext (not recommended)
- `--password <password>` - Password for encryption, or set `GALAXY_WALLET_PASSWORD` (required in `--json` mode unless `--no-encrypt` is set)
- `--json` - Output result as JSON

**Examples:**

```bash
# Import with all parameters
galaxy wallet import SXXXXXX... --name imported-wallet

# Import and encrypt at rest in one go (default; prompts for password)
galaxy wallet import --name imported

# Interactive import (prompts for secret)
galaxy wallet import

# Import mainnet wallet with JSON output
galaxy wallet import SXXXXXX... --name prod-wallet --mainnet --json
```

**Security Note:** When entering secret keys interactively, they are masked for security.

---

### List Wallets

Display all configured wallets on the system.

**Syntax:**
```bash
galaxy wallet list [options]
```

**Options:**
- `--json` - Output result as JSON

**Examples:**

```bash
# List wallets in table format
galaxy wallet list

# List wallets as JSON
galaxy wallet list --json
```

**Table Output:**
```
📋 Found 3 wallets:

┌──────────────────┬──────────────────────────────────────────────────────────┬──────────┐
│ Name             │ Public Key                                               │ Network  │
├──────────────────┼──────────────────────────────────────────────────────────┼──────────┤
│ my-wallet        │ GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX       │ testnet  │
├──────────────────┼──────────────────────────────────────────────────────────┼──────────┤
│ prod-wallet      │ GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX       │ mainnet  │
├──────────────────┼──────────────────────────────────────────────────────────┼──────────┤
│ imported-wallet  │ GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX       │ testnet  │
└──────────────────┴──────────────────────────────────────────────────────────┴──────────┘
```

**JSON Output:**
```json
{
  "wallets": [
    {
      "name": "my-wallet",
      "publicKey": "GXXXXXX...",
      "network": "testnet"
    }
  ]
}
```

---

### Wallet Info

Display stored wallet metadata and live balances from Horizon.

**Syntax:**
```bash
galaxy wallet info [options]
```

**Options:**
- `-n, --name <name>` - Wallet name. Optional if only one wallet is stored.
- `--json` - Output result as JSON

**Examples:**

```bash
# Show the public key, network, creation date, and balances
galaxy wallet info --name my-wallet

# JSON output for scripts
galaxy wallet info --name my-wallet --json
```

When the account has not been created on-chain yet, the command reports `exists: false` and an empty balance list.

---

### Fund Testnet Wallet

Fund a locally stored testnet wallet with Stellar Friendbot. Friendbot is rejected for mainnet wallets.

**Syntax:**
```bash
galaxy wallet fund [options]
```

**Options:**
- `-n, --name <name>` - Wallet name. Optional if only one wallet is stored.
- `--json` - Output result as JSON

**Examples:**

```bash
# Fund a named testnet wallet
galaxy wallet fund --name my-wallet

# Create, fund, then inspect
galaxy wallet create --name demo-wallet --testnet
galaxy wallet fund --name demo-wallet
galaxy wallet info --name demo-wallet
```

---

### Balance

Show XLM and asset balances for any Stellar account.

**Syntax:**
```bash
galaxy wallet balance [address] [options]
```

**Arguments:**
- `address` - Stellar public key (`G...`). Optional when `--name` is used.

**Options:**
- `-n, --name <name>` - Resolve address from a stored wallet name
- `--network <network>` - Override network (`testnet` | `mainnet`). Defaults to the wallet's network, or `testnet` for raw addresses.
- `--json` - Output result as JSON

**Examples:**

```bash
# By address
galaxy wallet balance GBZX...QO5J

# By stored wallet name (uses its saved network)
galaxy wallet balance --name my-wallet

# Force mainnet lookup
galaxy wallet balance GBZX...QO5J --network mainnet --json
```

**JSON Output:**
```json
{
  "address": "GBZX...QO5J",
  "network": "testnet",
  "exists": true,
  "balances": [
    { "asset": "XLM", "balance": "100.5000000", "type": "native" },
    {
      "asset": "USDC",
      "balance": "42.0000000",
      "limit": "1000000.0000000",
      "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      "type": "credit_alphanum4"
    }
  ]
}
```

When the account does not yet exist on the network, `exists` is `false` and `balances` is an empty array — non-error so it can be scripted.

---

### Send

Transfer XLM or an issued asset from a stored wallet to another Stellar address.

**Syntax:**
```bash
galaxy wallet send <from> <to> <amount> <asset> [options]
```

**Arguments:**
- `from` - Source wallet name (must be stored locally)
- `to` - Destination Stellar public key (`G...`)
- `amount` - Amount to send as a decimal string (e.g. `"1.5"`)
- `asset` - `XLM` for native, or `CODE:ISSUER` for issued assets

**Options:**
- `--memo <text>` - Optional memo text (max 28 bytes UTF-8)
- `--password <password>` - Password to decrypt the source wallet (required for encrypted wallets in `--json` mode)
- `--network <network>` - Override network. Defaults to the source wallet's network.
- `--json` - Output result as JSON

**Examples:**

```bash
# Native XLM transfer on testnet
galaxy wallet send alice GBOB...XYZ 1.5 XLM

# Issued asset (USDC) with a memo
galaxy wallet send alice GBOB...XYZ 25 USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN --memo "invoice-42"

# Encrypted source wallet, scripted
galaxy wallet send vault GBOB...XYZ 10 XLM --password "$PW" --json
```

**Behavior:**
- Validates the destination public key, parses the asset, and rejects non-positive amounts.
- For non-native assets, checks that the destination has the right trustline (unless it is the issuer itself) before submitting.
- Builds a single `payment` operation with `BASE_FEE`, signs with the source wallet's keypair, and submits via Horizon.
- On Horizon failures, surfaces `extras.result_codes` (e.g. `op_underfunded`, `op_no_trust`) in the error output.

**JSON Output:**
```json
{
  "success": true,
  "from": "GALI...CE",
  "fromWallet": "alice",
  "to": "GBOB...XYZ",
  "amount": "1.5",
  "asset": "XLM",
  "memo": null,
  "network": "testnet",
  "hash": "f1e2...",
  "ledger": 12345678
}
```

---

### Encrypt Existing Wallet

Encrypt a previously created plaintext wallet, replacing the file on disk with an encrypted version. Use this to migrate wallets created before the `--encrypt` flag existed.

**Syntax:**
```bash
galaxy wallet encrypt <name> [options]
```

**Arguments:**
- `name` - Existing wallet name

**Options:**
- `--password <password>` - Password (required in `--json` mode; prompted otherwise)
- `--json` - Output result as JSON

**Examples:**

```bash
# Interactive (will prompt + confirm password)
galaxy wallet encrypt my-wallet

# Scripted
galaxy wallet encrypt my-wallet --password "$PW" --json
```

> ⚠️ Lose the password and the secret cannot be recovered from the file. Keep a separate backup of the secret key (see `galaxy wallet backup`) before encrypting if you do not have one.

---

### Multi-Signature Wallets

Manage multi-signature wallets for enhanced security.

#### Create Multi-Sig Wallet

**Syntax:**
```bash
galaxy wallet multisig create [options]
```

**Options:**
- `--threshold <n>` - Required number of signatures (required)
- `--signers <addresses>` - Comma-separated signer public keys (required)
- `--network <network>` - Network (testnet/mainnet, default: testnet)

**Example:**
```bash
# Create 2-of-3 multisig wallet
galaxy wallet multisig create \
  --threshold 2 \
  --signers "GXXXXX...,GYYYYY...,GZZZZZ..." \
  --network testnet
```

#### Propose Transaction

Create a transaction proposal for multi-sig approval.

**Syntax:**
```bash
galaxy wallet multisig propose <xdr> [options]
```

**Arguments:**
- `xdr` - Transaction XDR to propose

**Options:**
- `--description <text>` - Description of the proposal

**Example:**
```bash
galaxy wallet multisig propose "AAAAAgAAAAD..." \
  --description "Payment to supplier"
```

#### Sign Transaction

Sign a proposed transaction.

**Syntax:**
```bash
galaxy wallet multisig sign <transaction-id> [options]
```

**Arguments:**
- `transaction-id` - Proposal ID to sign

**Options:**
- `--network <network>` - Network (testnet/mainnet)

**Example:**
```bash
galaxy wallet multisig sign abc123 --network testnet
```

---

### Ledger Hardware Wallet

Integrate with Ledger hardware wallets for enhanced security.

#### Connect to Ledger

**Syntax:**
```bash
galaxy wallet ledger connect
```

**Prerequisites:**
- Ledger device connected via USB
- Device unlocked
- Stellar app opened on device

**Example:**
```bash
galaxy wallet ledger connect
```

**Output:**
```
✔ Ledger connected!

Device Info:
  Model: Nano S Plus
  Firmware: 1.1.0
  App Version: 3.2.1
  Stellar App Open: Yes
```

#### List Ledger Accounts

**Syntax:**
```bash
galaxy wallet ledger accounts [options]
```

**Options:**
- `-s, --start <index>` - Start index (default: 0)
- `-c, --count <number>` - Number of accounts (default: 5)

**Example:**
```bash
# List first 10 accounts
galaxy wallet ledger accounts --start 0 --count 10
```

**Output:**
```
✔ Found 5 accounts:
────────────────────────────────────────
Index: 0
Path: 44'/148'/0'
Public Key: GXXXXXX...
────────────────────────────────────────
Index: 1
Path: 44'/148'/1'
Public Key: GXXXXXX...
```

---

### Biometric Authentication

Use biometric authentication for signing transactions.

#### Setup Biometric Auth

**Syntax:**
```bash
galaxy wallet biometric setup
```

**Example:**
```bash
galaxy wallet biometric setup
```

**Note:** In CLI environment, uses simulated biometric provider. In production, integrate with system biometric APIs.

#### Sign with Biometric

**Syntax:**
```bash
galaxy wallet biometric sign <transaction-xdr> [options]
```

**Arguments:**
- `transaction-xdr` - Transaction XDR to sign

**Options:**
- `--wallet <name>` - Wallet name to sign with
- `--network <network>` - Network (testnet/mainnet)

**Example:**
```bash
galaxy wallet biometric sign "AAAAAgAAAAD..." \
  --wallet my-wallet \
  --network testnet
```

---

### Social Recovery

Configure social recovery for account protection.

#### Setup Recovery

**Syntax:**
```bash
galaxy wallet recovery setup [options]
```

**Options:**
- `--guardians <addresses>` - Comma-separated guardian public keys (required)
- `--threshold <n>` - Recovery threshold (default: >50%)
- `--network <network>` - Network (testnet/mainnet)

**Example:**
```bash
galaxy wallet recovery setup \
  --guardians "GXXXXX...,GYYYYY...,GZZZZZ..." \
  --threshold 2 \
  --network testnet
```

#### Initiate Recovery

**Syntax:**
```bash
galaxy wallet recovery initiate [options]
```

**Options:**
- `--target <public-key>` - Wallet to recover (required)
- `--new-owner <public-key>` - New owner public key (required)
- `--network <network>` - Network (testnet/mainnet)

**Example:**
```bash
galaxy wallet recovery initiate \
  --target GXXXXX... \
  --new-owner GYYYYY... \
  --network testnet
```

---

### Backup and Restore

Create encrypted backups of all wallets.

#### Create Backup

**Syntax:**
```bash
galaxy wallet backup create
```

**Example:**
```bash
galaxy wallet backup create
```

The command will prompt for an encryption password and create an encrypted backup file.

**Output:**
```
✔ Backup created successfully!
Location: /home/user/.galaxy/backups/backup-2024-01-29T10-30-00.json
```

#### Restore Backup

**Syntax:**
```bash
galaxy wallet restore <backup-file>
```

**Arguments:**
- `backup-file` - Path to encrypted backup file

**Example:**
```bash
galaxy wallet restore ~/.galaxy/backups/backup-2024-01-29T10-30-00.json
```

The command will prompt for the decryption password.

---

## Storage and Security

### Wallet Storage

Wallets are stored in `~/.galaxy/wallets/` directory:

```
~/.galaxy/
├── wallets/
│   ├── my-wallet.json
│   ├── prod-wallet.json
│   └── imported-wallet.json
├── backups/
│   └── backup-2024-01-29.json
├── multisig-proposals.json
├── biometric-config.json
└── social-recovery.json
```

### Encryption at Rest

Wallets are encrypted by default when created or imported. The CLI delegates secret-key encryption to `@galaxy-kj/core-invisible-wallet/encryption` and stores local wallet files with restricted permissions. Use `--no-encrypt` only for disposable local development wallets.

- `galaxy wallet create` — encrypted on creation
- `galaxy wallet import` — encrypted on import
- `galaxy wallet encrypt <name>` — migrate an existing plaintext wallet
- `GALAXY_CONFIG_DIR=/tmp/galaxy-test` — override the config directory for isolated tests

Encrypted wallet files have shape:

```json
{
  "publicKey": "G...",
  "encryptedSecret": "v2:...",
  "network": "testnet",
  "createdAt": "2024-01-29T10:30:00.000Z",
  "encrypted": true,
  "encryptionProvider": "invisible-wallet"
}
```

Commands that need the secret (`wallet send`, etc.) prompt for the password on demand; in `--json` mode pass `--password`.

### Security Best Practices

1. **Secret Keys**: Store secret keys encrypted. Do not use `--no-encrypt` for any wallet that holds real value.

2. **Permissions**: Ensure `.galaxy` directory has appropriate permissions:
   ```bash
   chmod 700 ~/.galaxy
   chmod 600 ~/.galaxy/wallets/*.json
   ```

3. **Backups**: Regularly backup your wallets:
   ```bash
   galaxy wallet backup create
   ```

4. **Hardware Wallets**: Use Ledger for production environments and large amounts.

5. **Multi-Sig**: Use multi-signature wallets for shared or high-value accounts.

6. **Network Separation**: Keep testnet and mainnet wallets separate.

---

## Examples

### Complete Workflow

```bash
# 1. Create a wallet
galaxy wallet create --name dev-wallet --testnet

# 2. List existing wallets
galaxy wallet list

# 3. Setup multi-sig for production
galaxy wallet multisig create \
  --threshold 2 \
  --signers "GXXXXX...,GYYYYY..." \
  --network mainnet

# 4. Create encrypted backup
galaxy wallet backup create

# 5. Import existing wallet
galaxy wallet import --name legacy-wallet
```

### Automation with JSON

```bash
# Create wallet and parse JSON output
WALLET_JSON=$(galaxy wallet create --name auto-wallet --json)
PUBLIC_KEY=$(echo $WALLET_JSON | jq -r '.publicKey')
echo "Created wallet with public key: $PUBLIC_KEY"

# List all wallets programmatically
WALLETS=$(galaxy wallet list --json)
echo $WALLETS | jq '.wallets[] | .name'
```

### Multi-Sig Transaction Flow

```bash
# 1. Create multi-sig wallet
galaxy wallet multisig create --threshold 2 --signers "GA...,GB...,GC..."

# 2. Propose a transaction
PROPOSAL_ID=$(galaxy wallet multisig propose "AAAAAgAAAAD..." --description "Payment")

# 3. First signer signs
galaxy wallet multisig sign $PROPOSAL_ID

# 4. Second signer signs (reaches threshold)
galaxy wallet multisig sign $PROPOSAL_ID

# Transaction is now ready for execution
```

---

## Troubleshooting

### Common Issues

**Problem**: "No wallets found"
```bash
# Solution: Create a wallet first
galaxy wallet create --name first-wallet
```

**Problem**: "Wallet already exists"
```bash
# Solution: Use a different name or delete existing wallet
galaxy wallet create --name different-name
```

**Problem**: "Invalid secret key format"
```bash
# Solution: Ensure secret key starts with 'S' and is 56 characters
# Valid format: SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Problem**: "Ledger not detected"
```bash
# Solution:
# 1. Check USB connection
# 2. Unlock Ledger device
# 3. Open Stellar app
# 4. Check USB permissions on Linux:
sudo usermod -aG plugdev $USER
```

**Problem**: "Failed to decrypt backup"
```bash
# Solution: Ensure you're using the correct password
# Backup passwords cannot be recovered
```

### Debug Mode

Enable verbose logging:

```bash
export DEBUG=galaxy:*
galaxy wallet create --name debug-wallet
```

### Getting Help

```bash
# General help
galaxy wallet --help

# Command-specific help
galaxy wallet create --help
galaxy wallet multisig --help
galaxy wallet ledger --help
```

---

## API Integration

Use wallet commands in your scripts:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function createWallet(name: string) {
  const { stdout } = await execAsync(
    `galaxy wallet create --name ${name} --json`
  );
  return JSON.parse(stdout);
}

async function listWallets() {
  const { stdout } = await execAsync('galaxy wallet list --json');
  return JSON.parse(stdout);
}

// Usage
const wallet = await createWallet('my-app-wallet');
console.log('Public Key:', wallet.publicKey);

const wallets = await listWallets();
console.log('Total wallets:', wallets.wallets.length);
```

---

## Additional Resources

- [Stellar Documentation](https://developers.stellar.org)
- [Galaxy DevKit Documentation](../index.md)
- [CLI Guide](./cli-guide.md)
- [Example Code](../examples/wallet/)
- [Multi-Signature Guide](../examples/wallet/20-multisig-setup.ts)
- [Ledger Integration](../examples/wallet/08-ledger-setup.ts)
- [Social Recovery](../examples/wallet/14-setup-social-recovery.ts)

---

## Support

For issues and questions:
- GitHub Issues: https://github.com/Galaxy-KJ/Galaxy-DevKit/issues
- Discord Community: [Join Discord]
- Documentation: https://galaxy-devkit.io/docs
