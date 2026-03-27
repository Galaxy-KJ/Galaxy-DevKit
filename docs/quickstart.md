# Quickstart: Galaxy DevKit (5 Minutes)

Get your first smart wallet transaction in 5 minutes. For detailed explanations, see the [Full Getting Started Guide](./getting-started.md).

## Prerequisites

✅ Node.js v18+  
✅ [Stellar Testnet Account](https://laboratory.stellar.org/#account-creator)  
✅ 50 XLM from [Friendbot](https://laboratory.stellar.org/#friendbot)

## Installation

```bash
npm init -y
npm install @galaxy-kj/core-invisible-wallet @stellar/stellar-sdk
```

## 5 Steps

### 1️⃣ Create Wallet (30 seconds)

**`wallet.js`**:
```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';

const walletService = new InvisibleWalletService({
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
});

const { wallet, session } = await walletService.createWallet(
  { userId: 'user_' + Date.now(), email: 'dev@example.com', network: {} },
  'Password123!'
);

console.log('🔑 Public Key:', wallet.publicKey);
console.log('🎫 Session:', session.sessionToken);
```

**Run**:
```bash
node wallet.js
```

### 2️⃣ Fund Wallet (1 minute)

Copy your public key and go to: https://friendbot-testnet.stellar.org?addr=YOUR_PUBLIC_KEY

**Verify**:
```bash
curl "https://horizon-testnet.stellar.org/accounts/YOUR_PUBLIC_KEY" | grep -i "balance"
```

### 3️⃣ Create Session (30 seconds)

```javascript
const session = await walletService.createSession(
  wallet.id,
  'Password123!',
  { expiresIn: 3600 }
);

console.log('✅ Session ready:', session.sessionToken);
```

### 4️⃣ Sign & Submit (2 minutes)

```javascript
import { TransactionBuilder, Networks, BASE_FEE, Server } from '@stellar/stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');
const account = await server.loadAccount(wallet.publicKey);

const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET_PASSPHRASE,
})
  .addOperation({
    destination: 'GBBD47UZQ5DQQQOKZWT2XFYZTFKTGSVIVPJCTAHYPG2EA2HMWHGKJLAD',
    amount: '1',
    asset: { code: 'native' },
    type: 'payment',
  })
  .setTimeout(30)
  .build();

// Sign
const signed = await walletService.signTransaction(
  wallet.publicKey,
  session.sessionToken,
  tx.toXDR(),
  'Password123!'
);

// Submit
const result = await server.submitTransaction(tx);
console.log('🚀 Submitted:', result.id);
```

### 5️⃣ Revoke Session (30 seconds)

```javascript
await walletService.revokeSession(session.sessionToken);
console.log('🔓 Session revoked');
```

---

## Full Working Script

**`quick-demo.js`**:
```javascript
import { InvisibleWalletService } from '@galaxy-kj/core-invisible-wallet';
import { TransactionBuilder, Networks, BASE_FEE, Server } from '@stellar/stellar-sdk';

const networkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const walletService = new InvisibleWalletService(networkConfig);
  const server = new Server('https://horizon-testnet.stellar.org');

  // 1. Create wallet
  const { wallet, session: initialSession } = await walletService.createWallet(
    { userId: 'user_' + Date.now(), email: 'dev@example.com', network: networkConfig },
    'Password123!'
  );
  console.log('✅ Wallet:', wallet.publicKey);

  // 2. Create session
  const session = await walletService.createSession(wallet.id, 'Password123!', { expiresIn: 3600 });
  console.log('✅ Session created');

  // 3. Build transaction
  const account = await server.loadAccount(wallet.publicKey);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET_PASSPHRASE,
  })
    .addOperation({
      destination: 'GBBD47UZQ5DQQQOKZWT2XFYZTFKTGSVIVPJCTAHYPG2EA2HMWHGKJLAD',
      amount: '1',
      asset: { code: 'native' },
      type: 'payment',
    })
    .setTimeout(30)
    .build();

  // 4. Sign & submit
  await walletService.signTransaction(
    wallet.publicKey,
    session.sessionToken,
    tx.toXDR(),
    'Password123!'
  );
  const result = await server.submitTransaction(tx);
  console.log('✅ Submitted:', result.id);

  // 5. Revoke
  await walletService.revokeSession(session.sessionToken);
  console.log('✅ Done!');
}

main().catch(console.error);
```

**Run**:
```bash
node quick-demo.js
```

---

## Next Steps

- 📖 [Full Getting Started Guide](./getting-started.md)
- 🏗️ [Architecture Guide](./guides/architecture.md)
- 💰 [DeFi Integration](./guides/defi.md)
- 🤖 [Automation](./guides/automation.md)
- 📚 [Full API Reference](./api/api-reference.md)

**Questions?** Check [Troubleshooting](./getting-started.md#troubleshooting) or [open an issue](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues)
