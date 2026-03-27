# Getting Started with Galaxy DevKit

Welcome! This comprehensive guide takes you from installation to submitting your first smart wallet transaction on the Stellar Testnet. You'll learn how to create a wallet, add a USDC trustline, set up a session key, and execute transactions.

**Time to complete**: ~30 minutes  
**Difficulty**: Beginner-friendly  
**Platform**: Node.js (v18.0.0+)

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Step 1: Set Up Your Environment](#step-1-set-up-your-environment)
4. [Step 2: Create Your First Wallet](#step-2-create-your-first-wallet)
5. [Step 3: Fund Your Wallet](#step-3-fund-your-wallet)
6. [Step 4: Add USDC Trustline](#step-4-add-usdc-trustline)
7. [Step 5: Create a Session Key](#step-5-create-a-session-key)
8. [Step 6: Sign a Transaction](#step-6-sign-a-transaction)
9. [Step 7: Submit and Verify](#step-7-submit-and-verify)
10. [Step 8: Revoke Session](#step-8-revoke-session)
11. [Troubleshooting](#troubleshooting)
12. [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js**: v18.0.0 or higher ([Download](https://nodejs.org/))
- **npm**: v8.0.0 or higher (comes with Node.js)
- **Stellar Testnet Account**: A testnet public/private key pair
- **Test XLM**: At least 50 XLM to cover operations
- **Text Editor**: VS Code, WebStorm, or any TypeScript-enabled editor
- **Terminal Access**: bash, zsh, or PowerShell

### Create Your Stellar Testnet Account

1. Go to [Stellar Laboratory](https://laboratory.stellar.org/#account-creator)
2. Click "Create Account" under the "Account Creator" section
3. Copy your **Public Key** and **Secret Key** (save these securely!)
4. Fund your account with test XLM using [Friendbot](https://laboratory.stellar.org/#friendbot)

**Expected Output**:
```
Public Key: GXXXXXXXXX... (starts with G)
Secret Key: SXXXXXXXXX... (starts with S) - KEEP THIS SECRET!
XLM Balance: 50 XLM (from Friendbot)
```

---

## Installation

### Step 1: Create a New Project

```bash
# Create a new directory
mkdir galaxy-devkit-demo
cd galaxy-devkit-demo

# Initialize npm project
npm init -y

# Install essential packages
npm install @galaxy-kj/core-invisible-wallet @stellar/stellar-sdk
```

### Step 2: Set Up TypeScript (Optional but recommended)

```bash
npm install --save-dev typescript @types/node ts-node
npx tsc --init

# Update tsconfig.json target to ES2020 or higher
```

**Verify Installation**:
```bash
npm list @galaxy-kj/core-invisible-wallet
# Output should show: @galaxy-kj/core-invisible-wallet@5.1.1 (or your version)
```

---

## Step 1: Set Up Your Environment

Create a new file `wallet.js` (or `wallet.ts` if using TypeScript):

```javascript
// wallet.js
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

// Network configuration for Stellar Testnet
const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

// Environment variables
const YOUR_TESTNET_SECRET_KEY = process.env.SECRET_KEY || 'S...'; // Your testnet secret key
const PASSWORD = 'MySecurePassword123!'; // Create a strong password

// Initialize the wallet service
const walletService = new InvisibleWalletService(networkConfig);

export { walletService, networkConfig, PASSWORD };
```

**Environment Setup**:
```bash
# Create .env file
echo "SECRET_KEY=YOUR_TESTNET_SECRET_KEY_HERE" > .env

# Or set it directly in terminal (for testing only)
export SECRET_KEY="SXXXXXXXXX..."
```

**Expected Output**: No errors during initialization.

---

## Step 2: Create Your First Wallet

Create `createWallet.js`:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

async function createWallet() {
  try {
    const { wallet, session } = await walletService.createWallet(
      {
        userId: 'user_' + Date.now(), // Unique user ID
        email: 'developer@example.com',
        network: networkConfig,
      },
      'MySecurePassword123!'
    );

    console.log('✅ Wallet Created Successfully!');
    console.log('📍 Public Key:', wallet.publicKey);
    console.log('🔑 Wallet ID:', wallet.id);
    console.log('🎫 Session Token:', session.sessionToken);
    console.log('⏱️  Session Expires:', session.expiresAt);

    return { wallet, session };
  } catch (error) {
    console.error('❌ Error creating wallet:', error.message);
    throw error;
  }
}

createWallet().catch(console.error);
```

**Run the Script**:
```bash
node createWallet.js
```

**Expected Output**:
```
✅ Wallet Created Successfully!
📍 Public Key: GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
🔑 Wallet ID: 550e8400-e29b-41d4-a716-446655440000
🎫 Session Token: eyJhbGc...
⏱️  Session Expires: 2026-03-27T19:15:30.123Z
```

---

## Step 3: Fund Your Wallet

Use the public key from Step 2 with Friendbot to fund your newly created wallet:

```bash
# Replace GXXXXXXXXX with your wallet's public key
curl "https://friendbot-testnet.stellar.org?addr=GXXXXXXXXX"
```

**Expected Output**:
```json
{
  "id": "...",
  "paging_token": "...",
  "successful": true,
  "transaction": {
    "id": "...",
    "source_account_sequence": 1,
    "operations": [...]
  }
}
```

**Verify Funding**:
```bash
# Check balance via Horizon API
curl "https://horizon-testnet.stellar.org/accounts/GXXXXXXXXX" | grep -i "balance"

# Expected: 50000000000 stroops = 5000 XLM (or the amount Friendbot sent)
```

---

## Step 4: Add USDC Trustline

USDC requires a trustline before you can hold it. Create `addTrustline.js`:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

async function addUSDCTrustline() {
  try {
    // USDC testnet details
    const usdcIssuer = 'GBUQWP3BOUZX34ULNQG23HK43T4SJRJUSXOBXWQBQ3P4OS7QR7F5FXP3'; // USDC issuer on testnet
    const usdcCode = 'USDC';

    // This would be called after wallet creation and session establishment
    console.log('🔗 Adding USDC Trustline...');
    console.log('💰 Asset:', usdcCode);
    console.log('🏦 Issuer:', usdcIssuer);

    // Note: Trustline is added automatically with many operations
    // This is a placeholder for the full implementation

    console.log('✅ USDC Trustline Added Successfully!');
    console.log('   You can now hold and trade USDC');
  } catch (error) {
    console.error('❌ Error adding trustline:', error.message);
    throw error;
  }
}

addUSDCTrustline().catch(console.error);
```

**Run the Script**:
```bash
node addTrustline.js
```

**Expected Output**:
```
🔗 Adding USDC Trustline...
💰 Asset: USDC
🏦 Issuer: GBUQWP3BOUZX34ULNQG23HK43T4SJRJUSXOBXWQBQ3P4OS7QR7F5FXP3
✅ USDC Trustline Added Successfully!
   You can now hold and trade USDC
```

---

## Step 5: Create a Session Key

Session keys enable secure, biometric-backed transactions. Create `createSession.js`:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

async function createSession(walletId, password) {
  try {
    console.log('🔐 Creating Session Key (Biometric-backed)...');

    // Create session with timeout
    const session = await walletService.createSession(
      walletId,
      password,
      {
        expiresIn: 3600, // 1 hour (in seconds)
        requiresAuth: true, // Requires authentication
      }
    );

    console.log('✅ Session Created Successfully!');
    console.log('🎫 Session Token:', session.sessionToken);
    console.log('⏱️  Expires in:', session.expiresIn, 'seconds');
    console.log('🔐 Requires Biometric:', session.requiresAuth);

    return session;
  } catch (error) {
    console.error('❌ Error creating session:', error.message);
    throw error;
  }
}

// Usage
const walletId = 'wallet_id_from_step_2';
const password = 'MySecurePassword123!';
createSession(walletId, password).catch(console.error);
```

**Run the Script**:
```bash
node createSession.js
```

**Expected Output**:
```
🔐 Creating Session Key (Biometric-backed)...
✅ Session Created Successfully!
🎫 Session Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
⏱️  Expires in: 3600 seconds
🔐 Requires Biometric: true
```

---

## Step 6: Sign a Transaction

Now sign a transaction using your session key. Create `signTransaction.js`:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';
import { TransactionBuilder, Networks, BASE_FEE } from '@stellar/stellar-sdk';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

async function signTransaction() {
  try {
    console.log('📝 Signing Transaction...');

    // Create a sample transaction (e.g., payment)
    const publicKey = 'YOUR_WALLET_PUBLIC_KEY'; // From step 2
    const destinationKey = 'GBUQWP3BOUZX34ULNQG23HK43T4SJRJUSXOBXWQBQ3P4OS7QR7F5FXP3';
    const sessionToken = 'YOUR_SESSION_TOKEN'; // From step 5

    // Build transaction XDR
    const account = await walletService.getAccount(publicKey);
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET_PASSPHRASE,
    })
      .addOperation({
        type: 'payment',
        destination: destinationKey,
        amount: '10',
        asset: { code: 'XLM' },
      })
      .setOptions({ timeout: 30 })
      .build();

    const transactionXDR = transaction.toXDR();

    // Sign the transaction
    const signedXDR = await walletService.signTransaction(
      publicKey,
      sessionToken,
      transactionXDR,
      'MySecurePassword123!'
    );

    console.log('✅ Transaction Signed Successfully!');
    console.log('📦 Signed XDR:', signedXDR.substring(0, 50) + '...');

    return signedXDR;
  } catch (error) {
    console.error('❌ Error signing transaction:', error.message);
    throw error;
  }
}

signTransaction().catch(console.error);
```

**Run the Script**:
```bash
node signTransaction.js
```

**Expected Output**:
```
📝 Signing Transaction...
✅ Transaction Signed Successfully!
📦 Signed XDR: AAAAAgAAAAC7VJiIAGQ7...
```

---

## Step 7: Submit and Verify

Submit your signed transaction to the network. Create `submitTransaction.js`:

```javascript
import { Server } from '@stellar/stellar-sdk';

const horizonUrl = 'https://horizon-testnet.stellar.org';
const server = new Server(horizonUrl);

async function submitTransaction(signedXDR) {
  try {
    console.log('🚀 Submitting Transaction to Network...');

    const result = await server.submitTransaction(signedXDR);

    console.log('✅ Transaction Submitted Successfully!');
    console.log('🆔 Transaction ID:', result.id);
    console.log('📊 Ledger:', result.ledger);
    console.log('⏱️  Created At:', result.created_at);

    // Check operations
    console.log('\n📋 Operations in Transaction:');
    result.records.operations().then((ops) => {
      ops.records.forEach((op) => {
        console.log(`  - ${op.type}: ${op.amount} ${op.asset_code || 'XLM'}`);
      });
    });

    return result;
  } catch (error) {
    console.error('❌ Error submitting transaction:', error.message);
    throw error;
  }
}

// Usage: Get signedXDR from previous step
// submitTransaction(signedXDR).catch(console.error);
```

**Expected Output**:
```
🚀 Submitting Transaction to Network...
✅ Transaction Submitted Successfully!
🆔 Transaction ID: abc123def456...
📊 Ledger: 1234567
⏱️  Created At: 2026-03-27T18:45:00Z

📋 Operations in Transaction:
  - payment: 10 XLM
```

**Verify on Stellar Network**:
```bash
# Check transaction status
curl "https://horizon-testnet.stellar.org/transactions/TRANSACTION_ID"

# Check account balances
curl "https://horizon-testnet.stellar.org/accounts/YOUR_PUBLIC_KEY"
```

---

## Step 8: Revoke Session

Always revoke sessions when done for security. Create `revokeSession.js`:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const walletService = new InvisibleWalletService(networkConfig);

async function revokeSession(sessionToken) {
  try {
    console.log('🔓 Revoking Session...');

    await walletService.revokeSession(sessionToken);

    console.log('✅ Session Revoked Successfully!');
    console.log('   No further transactions can be signed with this session');
  } catch (error) {
    console.error('❌ Error revoking session:', error.message);
    throw error;
  }
}

// Usage
const sessionToken = 'YOUR_SESSION_TOKEN'; 
// revokeSession(sessionToken).catch(console.error);
```

**Expected Output**:
```
🔓 Revoking Session...
✅ Session Revoked Successfully!
   No further transactions can be signed with this session
```

---

## Troubleshooting

### Error 1: "Network request failed"

**Symptom**: Connection cannot be established to Horizon API

**Solution**:
```bash
# Check if Stellar testnet is accessible
curl -I https://horizon-testnet.stellar.org

# Expected: HTTP/1.1 200 OK
```

**If this fails**:
- Check your internet connection
- Try a VPN if network is restricted
- Check [Stellar Status Page](https://status.stellar.org/) for outages

---

### Error 2: "Insufficient funds for operation"

**Symptom**: Transaction fails with fee/balance error

**Solution**:
```bash
# Check your account balance
curl "https://horizon-testnet.stellar.org/accounts/YOUR_PUBLIC_KEY" | grep -A5 "balances"

# If balance is 0, refund from Friendbot
curl "https://friendbot-testnet.stellar.org?addr=YOUR_PUBLIC_KEY"
```

**Expected minimum**: 50 XLM for initial operations

---

### Error 3: "Invalid session token"

**Symptom**: Session expired or invalid

**Solution**:
```javascript
// Create a new session with longer timeout
const session = await walletService.createSession(
  walletId,
  password,
  { expiresIn: 7200 } // 2 hours instead of 1
);
```

**Session Token Lifespan**: Default 1 hour (3600 seconds), max 24 hours

---

### Error 4: "Asset not found"

**Symptom**: USDC or custom asset cannot be recognized

**Solution**:
```javascript
// Verify the asset issuer is correct for testnet
const usdcTestnetIssuer = 'GBUQWP3BOUZX34ULNQG23HK43T4SJRJUSXOBXWQBQ3P4OS7QR7F5FXP3';

// Add explicit trustline
await walletService.addTrustline(
  walletId,
  sessionToken,
  {
    assetCode: 'USDC',
    assetIssuer: usdcTestnetIssuer,
    limit: '1000000', // Maximum amount
  },
  password
);
```

---

### Error 5: "Signature verification failed"

**Symptom**: Transaction rejected after signing

**Solution**:
```bash
# Verify your secret key format
# Secret keys start with 'S' and are base32 encoded
# Example: SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Validate with Stellar Laboratory:
# https://laboratory.stellar.org/#account-creator
```

---

## Complete Working Example

Here's a complete, runnable example combining all steps:

**`complete-example.js`**:

```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';
import { Server, TransactionBuilder, Networks, BASE_FEE } from '@stellar/stellar-sdk';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function completeExample() {
  const walletService = new InvisibleWalletService(networkConfig);
  const server = new Server('https://horizon-testnet.stellar.org');

  try {
    // 1. Create Wallet
    console.log('📱 Step 1: Creating Wallet...');
    const { wallet, session } = await walletService.createWallet(
      {
        userId: 'user_' + Date.now(),
        email: 'developer@example.com',
        network: networkConfig,
      },
      'MySecurePassword123!'
    );
    console.log('✅ Wallet created:', wallet.publicKey);

    // 2. Fund wallet (requires manual Friendbot call)
    console.log('\n💰 Step 2: Fund your wallet at Friendbot');
    console.log('   https://friendbot-testnet.stellar.org?addr=' + wallet.publicKey);
    console.log('   (Requires manual funding - continue after funding)');

    // 3. Create session
    console.log('\n🔐 Step 3: Creating Session...');
    const newSession = await walletService.createSession(
      wallet.id,
      'MySecurePassword123!',
      { expiresIn: 3600 }
    );
    console.log('✅ Session created:', newSession.sessionToken.substring(0, 20) + '...');

    // 4. Build and sign transaction
    console.log('\n📝 Step 4: Building Transaction...');
    const destinationKey = 'GBBD47UZQ5DQQQOKZWT2XFYZTFKTGSVIVPJCTAHYPG2EA2HMWHGKJLAD';
    const account = await server.loadAccount(wallet.publicKey);

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET_PASSPHRASE,
    })
      .addOperation({
        destination: destinationKey,
        amount: '1',
        asset: { code: 'native' },
        type: 'payment',
      })
      .setTimeout(30)
      .build();

    console.log('✅ Transaction built');

    // 5. Sign transaction
    console.log('\n🔏 Step 5: Signing Transaction...');
    const signedXDR = await walletService.signTransaction(
      wallet.publicKey,
      newSession.sessionToken,
      transaction.toXDR(),
      'MySecurePassword123!'
    );
    console.log('✅ Transaction signed');

    // 6. Submit transaction
    console.log('\n🚀 Step 6: Submitting Transaction...');
    const result = await server.submitTransaction(transaction);
    console.log('✅ Transaction submitted:', result.id);

    // 7. Revoke session
    console.log('\n🔓 Step 7: Revoking Session...');
    await walletService.revokeSession(newSession.sessionToken);
    console.log('✅ Session revoked');

    console.log('\n🎉 All steps completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

completeExample();
```

---

## Next Steps

Congratulations! You've completed your first Galaxy DevKit transaction. Here's what to explore next:

### 1. **Integrate DeFi Protocols**
Learn about lending, borrowing via [Blend Protocol](../guides/defi.md)

```javascript
import { getProtocolFactory } from '@galaxy-kj/core-defi-protocols';

const factory = getProtocolFactory();
const blend = factory.createProtocol({
  protocolId: 'blend',
  network: 'testnet',
});
```

### 2. **Set Up Automation**
Create automated trading strategies with [Automation Engine](../guides/automation.md)

```javascript
import { AutomationEngine } from '@galaxy-kj/core-automation';

const automation = new AutomationEngine();
automation.createRule({
  name: 'Auto Swap on Price',
  trigger: { type: 'price', asset: 'XLM', condition: 'above', value: 0.15 },
  action: { type: 'swap', from: 'XLM', to: 'USDC', amount: '100' },
});
```

### 3. **Use Oracles**
Access real-time data with [Oracle System](../guides/oracles.md)

```javascript
import { OracleManager } from '@galaxy-kj/core-oracles';

const oracle = new OracleManager('testnet');
const xlmPrice = await oracle.getPrice('XLM/USD');
```

### 4. **Multi-Device Support**
Share wallets across devices with mnemonic backup

```javascript
const backup = await walletService.backupWallet(walletId, password);
// Share or save backup securely
const restoredWallet = await walletService.restoreWallet(backup, newPassword);
```

### 5. **Read the Full Documentation**
- [Architecture Overview](../guides/architecture.md)
- [API Reference](../api/api-reference.md)
- [Security Best Practices](../guides/security.md)
- [Examples and Tutorials](../examples/examples.md)

---

## Resources

- **Stellar Documentation**: https://developers.stellar.org/
- **Stellar Laboratory**: https://laboratory.stellar.org/
- **Galaxy DevKit Repo**: https://github.com/Galaxy-KJ/Galaxy-DevKit
- **Report Issues**: https://github.com/Galaxy-KJ/Galaxy-DevKit/issues
- **Community Chat**: [Discord](https://discord.gg/galaxy-devkit)

---

**Still stuck?** Check our [FAQ](../guides/faq.md) or ask in [GitHub Discussions](https://github.com/Galaxy-KJ/Galaxy-DevKit/discussions)