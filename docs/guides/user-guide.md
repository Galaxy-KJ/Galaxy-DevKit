# 📖 Galaxy DevKit User Guide

Complete guide for using Galaxy DevKit to build Stellar applications.

## 📋 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Using APIs](#-using-apis)
- [Using CLI](#-using-cli)
- [Examples](#-examples)
- [Troubleshooting](#-troubleshooting)

## 🚀 Installation

### Option 1: Local Development (From Monorepo)

If you're working on Galaxy DevKit itself:

```bash
# Build the CLI
npm run build

# Run directly
node tools/cli/dist/tools/cli/src/index.js [command]

# Or link globally
cd tools/cli && npm run build && npm link
```

### Option 2: Install CLI Globally (Published Package)
```bash
npm install -g @galaxy/cli
```

### Verify Installation
```bash
galaxy --version
galaxy help
```

## ⚡ Quick Start

### Option 1: Use APIs (For Developers)

```bash
# Install SDK
npm install @galaxy/sdk-typescript

# Use in your code
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
await galaxy.payments.send({
  from: wallet.publicKey,
  to: 'destination-address',
  amount: '10',
  asset: 'XLM'
});
```

### Option 2: Use CLI (For Full-Stack Development)

```bash
# Create new project
galaxy create my-stellar-app
cd my-stellar-app

# Start development
galaxy dev

# Deploy to production
galaxy deploy
```

## 🌐 Using APIs

### REST API

#### Base URL
```
Production: https://api.galaxy-devkit.com
Testnet: https://testnet-api.galaxy-devkit.com
```

#### Authentication
```bash
Authorization: Bearer your-api-key
```

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

### GraphQL API

#### Endpoint
```
https://api.galaxy-devkit.com/graphql
```

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
  }
}
```

#### Send Payment
```graphql
mutation SendPayment($input: SendPaymentInput!) {
  sendPayment(input: $input) {
    id
    hash
    status
  }
}
```

### WebSocket API

#### Real-time Updates
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
  console.log('Real-time update:', data);
};
```

### SDK Usage

#### TypeScript SDK
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

// Subscribe to updates
galaxy.websocket.subscribe('wallet:wallet123', (update) => {
  console.log('Wallet updated:', update);
});
```

#### Python SDK
```python
from galaxy_sdk import GalaxySDK

galaxy = GalaxySDK(
    api_key='your-api-key',
    network='testnet'
)

# Create wallet
wallet = galaxy.wallets.create(
    user_id='user123'
)

# Send payment
payment = galaxy.payments.send(
    from_address=wallet.public_key,
    to_address='destination-address',
    amount='10',
    asset='XLM'
)
```

#### JavaScript SDK
```javascript
import { GalaxySDK } from '@galaxy/sdk-javascript';

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
```

## 🛠️ Using CLI

### Available Commands

#### Create Project
```bash
galaxy create <project-name>
```

**Options:**
- `-t, --template <template>` - Project template (basic, nextjs, vue, minimal)
- `-d, --directory <dir>` - Project directory

**Examples:**
```bash
# Create basic React project
galaxy create my-wallet-app

# Create Next.js project
galaxy create my-defi-app -t nextjs

# Create Vue project
galaxy create my-nft-app -t vue

# Create minimal project
galaxy create my-simple-app -t minimal
```

#### Initialize Galaxy DevKit
```bash
galaxy init
```

**Options:**
- `-n, --name <name>` - Project name
- `--network <network>` - Stellar network (testnet/mainnet)

**Example:**
```bash
galaxy init -n "My Stellar Project" --network testnet
```

#### Development Server
```bash
galaxy dev
```

**Options:**
- `-p, --port <port>` - Port number (default: 3000)
- `--network <network>` - Stellar network
- `--watch` - Watch for changes

**Example:**
```bash
galaxy dev -p 3001 --network testnet --watch
```

#### Build Project
```bash
galaxy build
```

**Options:**
- `-w, --watch` - Watch for changes
- `--optimize` - Optimize for production
- `--analyze` - Analyze bundle size

**Example:**
```bash
galaxy build --optimize --analyze
```

#### Deploy to Production
```bash
galaxy deploy
```

**Options:**
- `-e, --env <environment>` - Environment (production/staging)
- `--network <network>` - Stellar network
- `--contracts` - Deploy smart contracts only
- `--api` - Deploy APIs only

**Example:**
```bash
galaxy deploy -e production --network mainnet
```

#### Generate Code
```bash
galaxy generate <type>
```

**Available Types:**
- `wallet` - Wallet management component
- `contract` - Smart contract template
- `api` - API endpoint template
- `component` - React/Vue component
- `hook` - Custom React hook
- `service` - Service class

**Examples:**
```bash
galaxy generate wallet --name WalletManager
galaxy generate contract --name TokenSwap --type swap
galaxy generate component --name PaymentForm --type form
```

#### Wallet Management
```bash
galaxy wallet <command>
```

**Available Commands:**
- `create` - Create a new wallet
- `import` - Import an existing wallet
- `list` - List all wallets
- `balance` - Check wallet balance
- `send` - Send a payment

**Examples:**
```bash
# Create new wallet
galaxy wallet create --name my-wallet --network testnet

# Import wallet
galaxy wallet import --secret SXXX...

# Check balance
galaxy wallet balance GXXX... --network testnet

# Send payment
galaxy wallet send --from GXXX... --to GYYY... --amount 100 --asset XLM
```

#### Blend Protocol (DeFi)
```bash
galaxy blend <command>
```

**Available Commands:**
- `stats` - View protocol statistics
- `supply` - Supply assets to lending pool
- `borrow` - Borrow assets from pool
- `withdraw` - Withdraw supplied assets
- `repay` - Repay borrowed assets

**Examples:**
```bash
# View stats
galaxy blend stats --network testnet

# Supply USDC
galaxy blend supply --asset USDC --amount 1000

# Borrow XLM
galaxy blend borrow --asset XLM --amount 500
```

#### Oracle Price Data
```bash
galaxy oracle <command>
```

**Available Commands:**
- `price <symbol>` - Query current price
- `history <symbol>` - Get price history with TWAP
- `sources list` - List oracle sources
- `validate <symbol>` - Validate price data

**Examples:**
```bash
# Get current price
galaxy oracle price XLM/USD

# Get price history
galaxy oracle history XLM/USD --period 1m

# Validate prices
galaxy oracle validate XLM/USD --threshold 5
```

#### Watch Mode (Real-time Monitoring)
```bash
galaxy watch <command>
```

**Available Commands:**
- `account <address>` - Monitor account activity
- `transaction <hash>` - Track transaction
- `oracle <symbol>` - Stream price updates
- `contract <id>` - Monitor contract events
- `network` - View network stats
- `dashboard` - Combined dashboard view

**Examples:**
```bash
# Watch account
galaxy watch account GXXX...

# Track transaction
galaxy watch transaction 7a8b...123f

# Monitor prices
galaxy watch oracle XLM

# View dashboard
galaxy watch dashboard
```

#### Interactive Mode
```bash
galaxy interactive
# or simply
galaxy
```

**Features:**
- Tab completion
- Command history
- Session management
- Guided workflows

**Example:**
```console
$ galaxy

🌌 Galaxy DevKit Interactive Mode

galaxy> wallet create
galaxy> oracle price XLM/USD
galaxy> exit
```

#### Help
```bash
galaxy help
galaxy help create
galaxy help deploy
galaxy help wallet
galaxy help oracle
```

### Project Templates

#### Basic Template
```bash
galaxy create my-app -t basic
```

**Includes:**
- React + TypeScript
- Stellar SDK integration
- Basic wallet functionality
- Supabase setup
- Tailwind CSS

#### Next.js Template
```bash
galaxy create my-app -t nextjs
```

**Includes:**
- Next.js 14
- App Router
- Server-side rendering
- API routes
- Stellar SDK
- Tailwind CSS
- Framer Motion

#### Vue Template
```bash
galaxy create my-app -t vue
```

**Includes:**
- Vue 3 + TypeScript
- Composition API
- Pinia state management
- Stellar SDK
- Vite build tool

#### Minimal Template
```bash
galaxy create my-app -t minimal
```

**Includes:**
- Basic HTML/CSS/JS
- Stellar SDK
- No framework dependencies
- Lightweight setup

## 📚 Examples

### Example 1: Simple Payment App

**Using CLI:**
```bash
# Create project
galaxy create payment-app -t nextjs
cd payment-app

# Start development
galaxy dev

# Open http://localhost:3000
```

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

### Example 2: DeFi Trading Platform

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
│   └── services/
│       ├── trading.ts
│       └── liquidity.ts
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

### Example 3: NFT Marketplace

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

## 🐛 Troubleshooting

### Common Issues

#### 1. CLI Not Found
```bash
# Reinstall CLI
npm uninstall -g @galaxy/cli
npm install -g @galaxy/cli
galaxy help
```

#### 2. Port Already in Use
```bash
# Use different port
galaxy dev -p 3001
```

#### 3. Build Failures
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
galaxy build
```

#### 4. Stellar Connection Issues
```bash
# Check network configuration
curl https://horizon-testnet.stellar.org/
```

#### 5. Supabase Connection Issues
```bash
# Check Supabase credentials
galaxy config --supabase
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=galaxy:* galaxy dev
```

### Getting Help

- **Documentation**: [docs.galaxy-devkit.com](https://docs.galaxy-devkit.com)
- **GitHub Issues**: [github.com/galaxy-devkit/galaxy-devkit/issues](https://github.com/galaxy-devkit/galaxy-devkit/issues)
- **Discord**: [discord.gg/galaxy-devkit](https://discord.gg/galaxy-devkit)

## 🎯 Use Cases

### For API Consumers
- **Fintech Apps** - Payment processing, wallet management
- **DeFi Platforms** - Smart contract interactions, liquidity pools
- **Gaming** - In-game currencies, NFT marketplaces
- **E-commerce** - Payment gateways, loyalty programs

### For CLI Users
- **Startups** - Rapid prototyping of Stellar applications
- **Developers** - Full-stack Stellar development
- **Enterprises** - Custom Stellar solutions
- **Students** - Learning Stellar development

## 🚀 Next Steps

1. **Choose Your Approach**
   - APIs for integration
   - CLI for full-stack development

2. **Start Building**
   - Create your first project
   - Explore the examples
   - Join the community

3. **Deploy to Production**
   - Build your application
   - Deploy smart contracts
   - Go live with your Stellar app

---

**Ready to build the future of Stellar applications?** 🌟
