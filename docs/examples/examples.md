# 📚 Galaxy DevKit Examples

Real-world examples and use cases for Galaxy DevKit.

## 📋 Table of Contents

- [Quick Start Examples](#-quick-start-examples)
- [API Examples](#-api-examples)
- [CLI Examples](#-cli-examples)
- [Full-Stack Examples](#-full-stack-examples)
- [Smart Contract Examples](#-smart-contract-examples)
- [Real-World Use Cases](#-real-world-use-cases)

## 🚀 Quick Start Examples

### Example 1: Simple Payment App

**Using APIs:**
```typescript
import { GalaxySDK } from '@galaxy/sdk-typescript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});

// Create wallet
const wallet = await galaxy.wallets.create({
  userId: 'user123'
});

// Send payment
const payment = await galaxy.payments.send({
  from: wallet.publicKey,
  to: 'destination-address',
  amount: '10',
  asset: 'XLM'
});

console.log('Payment sent:', payment.hash);
```

**Using CLI:**
```bash
# Create project
galaxy create payment-app -t nextjs

# Start development
cd payment-app
galaxy dev

# Deploy
galaxy deploy
```

### Example 2: Wallet Dashboard

**React Component:**
```tsx
import React, { useState, useEffect } from 'react';
import { useStellar } from '../hooks/useStellar';

export const WalletDashboard: React.FC = () => {
  const { wallet, balance, transactions, loading } = useStellar();
  const [amount, setAmount] = useState('');

  const handleSendPayment = async () => {
    await galaxy.payments.send({
      from: wallet.publicKey,
      to: 'destination-address',
      amount: amount,
      asset: 'XLM'
    });
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="wallet-dashboard">
      <h2>My Wallet</h2>
      <div className="balance">
        <span>Balance: {balance} XLM</span>
      </div>
      
      <div className="send-payment">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
        />
        <button onClick={handleSendPayment}>
          Send Payment
        </button>
      </div>

      <div className="transactions">
        <h3>Recent Transactions</h3>
        {transactions.map(tx => (
          <div key={tx.hash} className="transaction">
            <span>{tx.amount} XLM</span>
            <span>{tx.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## 🌐 API Examples

### REST API Examples

#### Create Wallet
```bash
curl -X POST https://api.galaxy-devkit.com/api/v1/wallets \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "network": "testnet"
  }'
```

#### Send Payment
```bash
curl -X POST https://api.galaxy-devkit.com/api/v1/payments \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "source-address",
    "to": "destination-address",
    "amount": "10.5",
    "asset": "XLM"
  }'
```

#### Get Wallet Balance
```bash
curl -X GET https://api.galaxy-devkit.com/api/v1/wallets/wallet123/balance \
  -H "Authorization: Bearer your-api-key"
```

### GraphQL Examples

#### Query Wallets
```graphql
query GetWallets($userId: String!) {
  wallets(userId: $userId) {
    id
    publicKey
    balance {
      asset
      amount
    }
    transactions {
      hash
      amount
      status
      createdAt
    }
  }
}
```

#### Mutation: Send Payment
```graphql
mutation SendPayment($input: SendPaymentInput!) {
  sendPayment(input: $input) {
    id
    hash
    status
    createdAt
  }
}
```

#### Subscription: Real-time Updates
```graphql
subscription WalletUpdates($walletId: String!) {
  walletUpdated(walletId: $walletId) {
    id
    balance {
      asset
      amount
    }
  }
}
```

### WebSocket Examples

#### JavaScript WebSocket Client
```javascript
const ws = new WebSocket('wss://api.galaxy-devkit.com/ws');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-api-key'
  }));

  // Subscribe to wallet updates
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'wallet:wallet123'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'wallet_updated':
      console.log('Balance updated:', data.balance);
      break;
    case 'transaction_created':
      console.log('New transaction:', data.transaction);
      break;
  }
};
```

## 🛠️ CLI Examples

### Project Creation Examples

#### Basic React App
```bash
galaxy create my-wallet-app -t basic
cd my-wallet-app
npm install
galaxy dev
```

#### Next.js App with Tailwind
```bash
galaxy create my-defi-app -t nextjs
cd my-defi-app
npm install
galaxy dev
```

#### Vue.js App
```bash
galaxy create my-nft-app -t vue
cd my-nft-app
npm install
galaxy dev
```

### Code Generation Examples

#### Generate Wallet Component
```bash
galaxy generate wallet --name WalletManager
```

**Creates:**
```tsx
// src/components/WalletManager.tsx
import React, { useState } from 'react';
import { useStellar } from '../hooks/useStellar';

export const WalletManager: React.FC = () => {
  const { wallet, createWallet, connectWallet } = useStellar();
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = async () => {
    try {
      await connectWallet();
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  return (
    <div className="wallet-manager">
      {!isConnected ? (
        <button onClick={handleConnect}>
          Connect Wallet
        </button>
      ) : (
        <div>
          <p>Connected: {wallet.publicKey}</p>
          <p>Balance: {wallet.balance} XLM</p>
        </div>
      )}
    </div>
  );
};
```

#### Generate Smart Contract
```bash
galaxy generate contract --name TokenSwap --type swap
```

**Creates:**
```rust
// contracts/token-swap/src/lib.rs
use soroban_sdk::{contract, contractimpl, symbol, vec, Env, Symbol, Vec};

#[contract]
pub struct TokenSwap;

#[contractimpl]
impl TokenSwap {
    pub fn swap(
        env: Env,
        from_token: Symbol,
        to_token: Symbol,
        amount: i128,
        min_amount: i128,
    ) -> i128 {
        // Implementation here
        amount
    }
}
```

### Deployment Examples

#### Deploy to Production
```bash
galaxy deploy -e production --network mainnet
```

#### Deploy Smart Contracts Only
```bash
galaxy deploy --contracts --network testnet
```

#### Deploy with Custom Configuration
```bash
galaxy deploy -e staging --network testnet --contracts
```

## 🏗️ Full-Stack Examples

### Example 1: DeFi Trading Platform

**Project Structure:**
```
defi-trading-platform/
├── src/
│   ├── components/
│   │   ├── TradingPair.tsx
│   │   ├── OrderBook.tsx
│   │   └── WalletConnect.tsx
│   ├── hooks/
│   │   ├── useTrading.ts
│   │   └── useLiquidity.ts
│   ├── services/
│   │   ├── trading.ts
│   │   └── liquidity.ts
│   └── pages/
│       ├── index.tsx
│       └── trading.tsx
├── contracts/
│   ├── liquidity-pool/
│   └── token-swap/
└── supabase/
    └── functions/
```

**Trading Component:**
```tsx
import React, { useState, useEffect } from 'react';
import { useStellar } from '../hooks/useStellar';
import { useTrading } from '../hooks/useTrading';

export const TradingPair: React.FC = () => {
  const { wallet } = useStellar();
  const { 
    tradingPair, 
    orderBook, 
    placeOrder, 
    getPrice 
  } = useTrading('XLM/USDC');

  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');

  const handlePlaceOrder = async () => {
    await placeOrder({
      pair: 'XLM/USDC',
      side: 'buy',
      amount: parseFloat(amount),
      price: parseFloat(price)
    });
  };

  return (
    <div className="trading-pair">
      <h2>Trading: {tradingPair}</h2>
      
      <div className="order-form">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
        />
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
        />
        <button onClick={handlePlaceOrder}>
          Place Order
        </button>
      </div>

      <div className="order-book">
        <h3>Order Book</h3>
        {orderBook.map(order => (
          <div key={order.id} className="order">
            <span>{order.price}</span>
            <span>{order.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### Example 2: NFT Marketplace

**NFT Component:**
```tsx
import React, { useState, useEffect } from 'react';
import { useStellar } from '../hooks/useStellar';

export const NFTMarketplace: React.FC = () => {
  const { wallet } = useStellar();
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNFTs();
  }, []);

  const fetchNFTs = async () => {
    try {
      const response = await fetch('/api/nfts');
      const data = await response.json();
      setNfts(data);
    } catch (error) {
      console.error('Failed to fetch NFTs:', error);
    } finally {
      setLoading(false);
    }
  };

  const buyNFT = async (nftId: string, price: string) => {
    try {
      await galaxy.payments.send({
        from: wallet.publicKey,
        to: 'nft-contract-address',
        amount: price,
        asset: 'XLM',
        memo: `Buy NFT ${nftId}`
      });
    } catch (error) {
      console.error('Failed to buy NFT:', error);
    }
  };

  if (loading) return <div>Loading NFTs...</div>;

  return (
    <div className="nft-marketplace">
      <h2>NFT Marketplace</h2>
      
      <div className="nft-grid">
        {nfts.map(nft => (
          <div key={nft.id} className="nft-card">
            <img src={nft.image} alt={nft.name} />
            <h3>{nft.name}</h3>
            <p>Price: {nft.price} XLM</p>
            <button onClick={() => buyNFT(nft.id, nft.price)}>
              Buy NFT
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## 🔗 Smart Contract Examples

### Example 1: Token Swap Contract

**Contract Code:**
```rust
// contracts/token-swap/src/lib.rs
use soroban_sdk::{contract, contractimpl, symbol, vec, Env, Symbol, Vec, Address};

#[contract]
pub struct TokenSwap;

#[contractimpl]
impl TokenSwap {
    pub fn swap(
        env: Env,
        from_token: Address,
        to_token: Address,
        amount: i128,
        min_amount: i128,
    ) -> i128 {
        // Get current price from oracle
        let price = Self::get_price(env.clone(), from_token.clone(), to_token.clone());
        
        // Calculate output amount
        let output_amount = (amount * price) / 1000000; // 6 decimal places
        
        // Check minimum amount
        if output_amount < min_amount {
            panic!("Insufficient output amount");
        }
        
        // Transfer tokens
        Self::transfer_from(env.clone(), from_token, env.current_contract_address(), amount);
        Self::transfer_to(env.clone(), to_token, env.current_contract_address(), output_amount);
        
        output_amount
    }
    
    fn get_price(env: Env, from: Address, to: Address) -> i128 {
        // Implementation to get price from oracle
        1000000 // Placeholder
    }
}
```

**Using the Contract:**
```typescript
// Deploy contract
const contract = await galaxy.contracts.deploy({
  type: 'token-swap',
  network: 'testnet'
});

// Call swap function
const result = await galaxy.contracts.call({
  contractId: contract.id,
  method: 'swap',
  parameters: {
    from_token: 'XLM',
    to_token: 'USDC',
    amount: '100',
    min_amount: '95'
  }
});
```

### Example 2: Liquidity Pool Contract

**Contract Code:**
```rust
// contracts/liquidity-pool/src/lib.rs
use soroban_sdk::{contract, contractimpl, symbol, vec, Env, Symbol, Vec, Address};

#[contract]
pub struct LiquidityPool;

#[contractimpl]
impl LiquidityPool {
    pub fn add_liquidity(
        env: Env,
        token_a: Address,
        token_b: Address,
        amount_a: i128,
        amount_b: i128,
    ) -> i128 {
        // Add liquidity to pool
        let pool_id = Self::get_pool_id(env.clone(), token_a.clone(), token_b.clone());
        
        // Transfer tokens to pool
        Self::transfer_from(env.clone(), token_a, env.current_contract_address(), amount_a);
        Self::transfer_from(env.clone(), token_b, env.current_contract_address(), amount_b);
        
        // Mint LP tokens
        let lp_amount = Self::calculate_lp_tokens(env.clone(), pool_id, amount_a, amount_b);
        Self::mint_lp_tokens(env.clone(), env.current_contract_address(), lp_amount);
        
        lp_amount
    }
    
    pub fn remove_liquidity(
        env: Env,
        pool_id: i128,
        lp_amount: i128,
    ) -> (i128, i128) {
        // Remove liquidity from pool
        let (amount_a, amount_b) = Self::calculate_removal(env.clone(), pool_id, lp_amount);
        
        // Burn LP tokens
        Self::burn_lp_tokens(env.clone(), env.current_contract_address(), lp_amount);
        
        // Transfer tokens back
        Self::transfer_to(env.clone(), pool_id, env.current_contract_address(), amount_a);
        Self::transfer_to(env.clone(), pool_id, env.current_contract_address(), amount_b);
        
        (amount_a, amount_b)
    }
}
```

## 🌍 Real-World Use Cases

### 1. Fintech Payment App

**Features:**
- User registration and KYC
- Wallet creation and management
- Payment processing
- Transaction history
- Real-time notifications

**Implementation:**
```typescript
// User registration
const user = await galaxy.users.create({
  email: 'user@example.com',
  name: 'John Doe',
  kyc: {
    documentType: 'passport',
    documentNumber: '123456789'
  }
});

// Create wallet
const wallet = await galaxy.wallets.create({
  userId: user.id,
  network: 'mainnet'
});

// Process payment
const payment = await galaxy.payments.send({
  from: wallet.publicKey,
  to: 'merchant-address',
  amount: '25.50',
  asset: 'XLM',
  memo: 'Payment for services'
});
```

### 2. DeFi Yield Farming Platform

**Features:**
- Liquidity provision
- Yield farming
- Staking rewards
- Automated strategies

**Implementation:**
```typescript
// Provide liquidity
const liquidity = await galaxy.defi.provideLiquidity({
  poolId: 'XLM/USDC',
  amountA: '1000',
  amountB: '1000',
  userWallet: wallet.publicKey
});

// Start yield farming
const farming = await galaxy.defi.startFarming({
  poolId: 'XLM/USDC',
  amount: '1000',
  duration: '30d'
});

// Check rewards
const rewards = await galaxy.defi.getRewards({
  poolId: 'XLM/USDC',
  userWallet: wallet.publicKey
});
```

### 3. NFT Gaming Platform

**Features:**
- NFT minting and trading
- In-game currency
- Player rewards
- Marketplace integration

**Implementation:**
```typescript
// Mint NFT
const nft = await galaxy.nfts.mint({
  name: 'Epic Sword',
  description: 'A legendary weapon',
  image: 'https://example.com/sword.png',
  attributes: {
    damage: 100,
    rarity: 'legendary'
  }
});

// Trade NFT
const trade = await galaxy.nfts.trade({
  nftId: nft.id,
  seller: 'seller-address',
  buyer: 'buyer-address',
  price: '50',
  currency: 'XLM'
});
```

## 🚀 Getting Started

### 1. Choose Your Approach

**API-First (For Developers):**
```bash
npm install @galaxy/sdk-typescript
```

**CLI-First (For Full-Stack):**
```bash
npm install -g @galaxy/cli
galaxy create my-app
```

### 2. Start Building

**Simple Payment App:**
```bash
galaxy create payment-app -t nextjs
cd payment-app
galaxy dev
```

**DeFi Platform:**
```bash
galaxy create defi-platform -t nextjs
cd defi-platform
galaxy generate contract --name LiquidityPool
galaxy dev
```

### 3. Deploy to Production

```bash
galaxy build
galaxy deploy
```

## 📚 Additional Resources

- [API Reference](./api-reference.md)
- [CLI Guide](./cli-guide.md)
- [Smart Contracts](./smart-contracts.md)
- [Deployment Guide](./deployment.md)
- [Troubleshooting](./troubleshooting.md)
