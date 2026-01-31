# 🛠️ Galaxy DevKit CLI Guide

Complete guide for using Galaxy DevKit CLI tools.

## 📋 Table of Contents

- [Installation](#-installation)
- [Commands](#-commands)
- [Project Templates](#-project-templates)
- [Development Workflow](#-development-workflow)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)

## 🚀 Installation

### Option 1: Local Development (From Monorepo)

If you're working on Galaxy DevKit itself or want to run the CLI from source:

```bash
# 1. Build the CLI
npm run build

# 2. Run the CLI directly
node tools/cli/dist/tools/cli/src/index.js [command] [options]

# Or create an alias for convenience
alias galaxy="node $(pwd)/tools/cli/dist/tools/cli/src/index.js"
```

### Option 2: Global Link (For Local Testing)

```bash
# Navigate to CLI directory
cd tools/cli

# Build the CLI
npm run build

# Link globally
npm link

# Now you can use 'galaxy' command anywhere
galaxy --version
galaxy help
```

### Option 3: Global Installation (Published Package)
```bash
npm install -g @galaxy/cli
```

### Verify Installation
```bash
galaxy --version
galaxy help
```

## 📝 Commands

### `galaxy create <project-name>`

Creates a new Galaxy project with full Stellar integration.

```bash
galaxy create my-stellar-app
```

**Options:**
- `-t, --template <template>` - Project template (default: basic)
- `-d, --directory <dir>` - Project directory (default: current)

**Available Templates:**
- `basic` - React + TypeScript + Stellar SDK
- `nextjs` - Next.js + Tailwind + Stellar SDK
- `vue` - Vue.js + TypeScript + Stellar SDK
- `minimal` - Minimal setup with just Stellar SDK

**Example:**
```bash
galaxy create my-wallet-app -t nextjs -d ./projects
```

**Creates:**
```
my-wallet-app/
├── src/
│   ├── components/
│   │   ├── WalletCard.tsx
│   │   ├── TransactionForm.tsx
│   │   └── BalanceDisplay.tsx
│   ├── hooks/
│   │   └── useStellar.ts
│   ├── services/
│   │   └── stellar.ts
│   └── pages/
│       └── index.tsx
├── contracts/
│   ├── smart-swap/
│   └── security-limits/
├── supabase/
│   ├── config.toml
│   └── migrations/
├── package.json
├── next.config.js
└── README.md
```

### `galaxy init`

Initializes Galaxy DevKit in the current directory.

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

**Creates:**
```
./
├── galaxy.config.js
├── supabase/
│   └── config.toml
└── contracts/
    └── README.md
```

### `galaxy dev`

Starts the development server with hot reload.

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

**Features:**
- Hot reload for React/Vue components
- Stellar testnet connection
- Real-time balance updates
- Smart contract interaction
- WebSocket connections

### `galaxy build`

Builds the project for production.

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

**Output:**
```
dist/
├── static/
│   ├── js/
│   ├── css/
│   └── images/
├── contracts/
│   ├── smart-swap.wasm
│   └── security-limits.wasm
└── supabase/
    └── functions/
```

### `galaxy deploy`

Deploys the project to production.

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

**Deployment Process:**
1. Builds the project
2. Deploys smart contracts to Stellar
3. Sets up Supabase database
4. Deploys APIs to cloud
5. Configures production environment

### `galaxy generate <type>`

Generates code templates and boilerplate.

```bash
galaxy generate wallet
galaxy generate contract
galaxy generate api
galaxy generate component
```

**Available Types:**
- `wallet` - Wallet management component
- `contract` - Smart contract template
- `api` - API endpoint template
- `component` - React/Vue component
- `hook` - Custom React hook
- `service` - Service class

**Example:**
```bash
galaxy generate wallet --name WalletManager
```

**Creates:**
```typescript
// src/components/WalletManager.tsx
import React from 'react';
import { useStellar } from '../hooks/useStellar';

export const WalletManager: React.FC = () => {
  const { wallet, createWallet, connectWallet } = useStellar();

  return (
    <div>
      {/* Wallet management UI */}
    </div>
  );
};
```

### `galaxy wallet`

Manage Stellar wallets from the command line.

```bash
galaxy wallet create
```

**Common Commands:**
- `galaxy wallet create` - Create a new wallet
- `galaxy wallet import` - Import an existing wallet
- `galaxy wallet list` - List all wallets
- `galaxy wallet balance <address>` - Check wallet balance
- `galaxy wallet send` - Send a payment

**Examples:**
```bash
# Create new wallet
galaxy wallet create --name my-wallet --network testnet

# Import wallet from secret key
galaxy wallet import --secret SXXX...

# Check balance
galaxy wallet balance GXXX... --network testnet

# Send payment
galaxy wallet send --from GXXX... --to GYYY... --amount 100 --asset XLM
```

See [Wallet Commands Documentation](../cli/wallet.md) for complete details.

### `galaxy blend`

Interact with Blend Protocol for DeFi operations.

```bash
galaxy blend stats
```

**Common Commands:**
- `galaxy blend stats` - View Blend protocol statistics
- `galaxy blend supply` - Supply assets to lending pool
- `galaxy blend borrow` - Borrow assets from pool
- `galaxy blend withdraw` - Withdraw supplied assets
- `galaxy blend repay` - Repay borrowed assets

**Examples:**
```bash
# View protocol stats
galaxy blend stats --network testnet

# Supply USDC to pool
galaxy blend supply --asset USDC --amount 1000 --pool mainnet

# Borrow XLM
galaxy blend borrow --asset XLM --amount 500 --pool mainnet
```

See [Blend Commands Documentation](../cli/blend.md) for complete details.

### `galaxy oracle`

Query and validate oracle price data during development.

```bash
galaxy oracle price XLM/USD
```

**Common Commands:**
- `galaxy oracle price <symbol>` - Query current aggregated price
- `galaxy oracle history <symbol> --period 1m` - Poll prices and compute TWAP
- `galaxy oracle sources list` - List available oracle sources
- `galaxy oracle sources add <name> <url>` - Add custom oracle source (use `{symbol}`)
- `galaxy oracle validate <symbol> --threshold 5` - Validate prices against deviation threshold
- `galaxy oracle strategies list` - List aggregation strategies

**Examples:**
```bash
galaxy oracle price XLM/USD --strategy median
galaxy oracle price XLM/USD --sources coingecko,coinmarketcap
galaxy oracle price XLM/USD --watch 5s
galaxy oracle price XLM/USD --network testnet

galaxy oracle history XLM/USD --period 1m --interval 5s
galaxy oracle history XLM/USD --network mainnet

galaxy oracle sources list
galaxy oracle sources add myapi https://example.com/price?symbol={symbol}&network={network}

galaxy oracle validate XLM/USD --threshold 5 --max-age 60s
galaxy oracle validate XLM/USD --network testnet

galaxy oracle strategies list
```

See [Oracle Commands Documentation](../cli/oracle.md) for complete details.

### `galaxy watch`

Monitor Stellar network activity in real-time.

```bash
galaxy watch account GXXX...
```

**Common Commands:**
- `galaxy watch account <address>` - Monitor account balance and payments
- `galaxy watch transaction <hash>` - Track transaction until confirmation
- `galaxy watch oracle <symbol>` - Stream price updates from oracles
- `galaxy watch contract <id>` - Monitor Soroban contract events
- `galaxy watch network` - View live ledger and TPS stats
- `galaxy watch dashboard` - Multi-panel combined view

**Examples:**
```bash
# Watch account activity
galaxy watch account GXXX... --interval 5

# Track specific transaction
galaxy watch transaction 7a8b...123f --timeout 60

# Monitor XLM price
galaxy watch oracle XLM --interval 2

# View network dashboard
galaxy watch dashboard --network mainnet
```

See [Watch Commands Documentation](../cli/watch.md) for complete details.

### `galaxy interactive`

Launch interactive REPL mode with autocomplete and command history.

```bash
galaxy interactive
# or simply
galaxy
```

**Features:**
- Tab completion for commands and options
- Command history with arrow keys
- Session state management
- Guided workflows
- Real-time feedback

**Example Session:**
```console
$ galaxy

🌌 Galaxy DevKit Interactive Mode
Type 'help' for commands or 'exit' to quit

galaxy> wallet create
? Wallet name: dev-wallet
✓ Wallet created: GABC...XYZ

galaxy> oracle price XLM/USD
XLM/USD: $0.1234 (5/5 sources)

galaxy> exit
Goodbye! 👋
```

See [Interactive Mode Documentation](../cli/interactive.md) for complete details.

### `galaxy test`

Runs tests for the project.

```bash
galaxy test
```

**Options:**
- `--watch` - Watch for changes
- `--coverage` - Generate coverage report
- `--contracts` - Test smart contracts only

**Example:**
```bash
galaxy test --coverage --contracts
```

### `galaxy help`

Shows help information and available commands.

```bash
galaxy help
galaxy help create
galaxy help deploy
```

## 🎨 Project Templates

### Basic Template
```bash
galaxy create my-app -t basic
```

**Includes:**
- React + TypeScript
- Stellar SDK integration
- Basic wallet functionality
- Supabase setup
- Tailwind CSS

### Next.js Template
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

### Vue Template
```bash
galaxy create my-app -t vue
```

**Includes:**
- Vue 3 + TypeScript
- Composition API
- Pinia state management
- Stellar SDK
- Vite build tool

### Minimal Template
```bash
galaxy create my-app -t minimal
```

**Includes:**
- Basic HTML/CSS/JS
- Stellar SDK
- No framework dependencies
- Lightweight setup

## 🔄 Development Workflow

### 1. Create Project
```bash
galaxy create my-stellar-app
cd my-stellar-app
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development
```bash
galaxy dev
```

### 4. Develop Features
- Edit components in `src/components/`
- Add new hooks in `src/hooks/`
- Create services in `src/services/`
- Smart contracts in `contracts/`

### 5. Test Changes
```bash
galaxy test
```

### 6. Build for Production
```bash
galaxy build
```

### 7. Deploy
```bash
galaxy deploy
```

## 🚀 Deployment

### Environment Configuration

Create `.env.production`:
```bash
# Stellar Network
STELLAR_NETWORK=mainnet
STELLAR_HORIZON_URL=https://horizon.stellar.org

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-key

# API Keys
GALAXY_API_KEY=your-api-key
```

### Deploy to Vercel
```bash
galaxy deploy --platform vercel
```

### Deploy to Netlify
```bash
galaxy deploy --platform netlify
```

### Deploy Smart Contracts
```bash
galaxy deploy --contracts --network mainnet
```

## 🔧 Configuration

### Galaxy Config (`galaxy.config.js`)
```javascript
module.exports = {
  // Project settings
  name: 'my-stellar-app',
  version: '1.0.0',
  
  // Stellar settings
  stellar: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  },
  
  // Supabase settings
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
  
  // Build settings
  build: {
    outDir: 'dist',
    optimize: true,
    sourcemap: true
  },
  
  // Development settings
  dev: {
    port: 3000,
    host: 'localhost',
    open: true
  }
};
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "galaxy dev",
    "build": "galaxy build",
    "deploy": "galaxy deploy",
    "test": "galaxy test",
    "generate": "galaxy generate"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Error: Port 3000 is already in use
# Solution: Use different port
galaxy dev -p 3001
```

#### 2. Stellar Network Connection Issues
```bash
# Check network configuration
galaxy config --network testnet
```

#### 3. Supabase Connection Issues
```bash
# Verify Supabase credentials
galaxy config --supabase
```

#### 4. Build Failures
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
galaxy build
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=galaxy:* galaxy dev
```

### Logs
```bash
# View logs
galaxy logs
galaxy logs --tail
```

## 📚 Examples

### Complete Example

```bash
# 1. Create project
galaxy create my-wallet-app -t nextjs

# 2. Navigate to project
cd my-wallet-app

# 3. Install dependencies
npm install

# 4. Start development
galaxy dev

# 5. Open browser
# http://localhost:3000

# 6. Generate wallet component
galaxy generate wallet --name WalletDashboard

# 7. Test the app
galaxy test

# 8. Build for production
galaxy build

# 9. Deploy
galaxy deploy
```

### Custom Configuration

```bash
# Initialize with custom settings
galaxy init -n "My Custom App" --network mainnet

# Generate custom components
galaxy generate component --name PaymentForm --type form
galaxy generate hook --name usePayments
galaxy generate service --name PaymentService

# Deploy with custom environment
galaxy deploy -e staging --network testnet
```

## 🆘 Support

- **Documentation**: [docs.galaxy-devkit.com](https://docs.galaxy-devkit.com)
- **Discord**: [discord.gg/galaxy-devkit](https://discord.gg/galaxy-devkit)
- **GitHub Issues**: [github.com/galaxy-devkit/galaxy-devkit/issues](https://github.com/galaxy-devkit/galaxy-devkit/issues)
