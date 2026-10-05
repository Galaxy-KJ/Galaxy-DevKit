# Getting Started with Galaxy DevKit

Welcome to Galaxy DevKit! This guide will help you get up and running with the complete development framework for Stellar ecosystem.

## 🚀 Quick Start

### Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm or yarn** - Package manager
- **Git** - Version control
- **Supabase CLI** - [Install here](https://supabase.com/docs/guides/cli)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/galaxy-devkit/galaxy-devkit.git
   cd galaxy-devkit
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Bootstrap the monorepo:**
   ```bash
   npm install
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```

## 🏗️ Project Structure

Galaxy DevKit is organized as a monorepo with the following structure:

```
galaxy-devkit/
├── packages/                 # Core packages
│   ├── core/               # Core functionality
│   ├── contracts/          # Smart contracts
│   ├── api/               # API packages
│   ├── sdk/               # SDK packages
│   └── templates/         # Project templates
├── tools/                  # Development tools
├── docs/                  # Documentation
├── examples/              # Example projects
└── tests/                 # Test suites
```

## 🔧 Configuration

### Environment Setup

1. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Configure environment variables:**
   ```env
   # Galaxy API Configuration
   GALAXY_API_URL=http://localhost:3001
   GALAXY_WEBSOCKET_URL=ws://localhost:3001
   GALAXY_NETWORK=testnet

   # Supabase Configuration
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

   # Stellar Configuration
   STELLAR_NETWORK=testnet
   STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
   ```

### Supabase Setup

1. **Create Supabase project:**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Get your project URL and API keys

2. **Initialize Supabase:**
   ```bash
   supabase init
   ```

3. **Start Supabase locally:**
   ```bash
   supabase start
   ```

4. **Run migrations:**
   ```bash
   supabase db push
   ```

## 🚀 Creating Your First Project

### Using the CLI

#### Option 1: Using CLI from the Monorepo (Recommended for Contributors)

1. **Build the CLI:**
   ```bash
   npm run build
   ```

2. **Create a new project:**
   ```bash
   node tools/cli/dist/tools/cli/src/index.js create my-dapp --template basic
   ```

3. **Or link the CLI globally:**
   ```bash
   cd tools/cli
   npm run build
   npm link
   cd ../..
   ```

4. **Now you can use the `galaxy` command:**
   ```bash
   galaxy create my-dapp --template basic
   ```

5. **Navigate to project:**
   ```bash
   cd my-dapp
   ```

6. **Install dependencies:**
   ```bash
   npm install
   ```

7. **Start development server:**
   ```bash
   npm run dev
   ```

#### Option 2: Using Published CLI (For End Users)

1. **Install Galaxy CLI globally:**
   ```bash
   npm install -g @galaxy/cli
   ```

2. **Create a new project:**
   ```bash
   galaxy create my-dapp --template basic
   ```

3. **Navigate to project:**
   ```bash
   cd my-dapp
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

### Manual Setup

1. **Create project directory:**
   ```bash
   mkdir my-dapp
   cd my-dapp
   ```

2. **Initialize project:**
   ```bash
   galaxy init --template basic
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start development:**
   ```bash
   npm run dev
   ```

## 📱 Available Templates

### Basic Template
A simple Stellar DApp with wallet connection and basic operations.

**Features:**
- Wallet connection
- Balance display
- Send payments
- Transaction history

### DeFi Template
A DeFi application with advanced features.

**Features:**
- Smart contracts
- Automated trading
- Liquidity management
- Price oracles

### NFT Template
An NFT marketplace template.

**Features:**
- NFT creation
- Marketplace functionality
- Royalty management
- Metadata handling

### Enterprise Template
An enterprise-grade application template.

**Features:**
- Multi-tenant architecture
- Advanced security
- Compliance features
- Analytics dashboard

## 🛠️ Development Workflow

### Working with Packages

1. **Navigate to package:**
   ```bash
   cd packages/core/stellar-sdk
   ```

2. **Start development:**
   ```bash
   npm run dev
   ```

3. **Run tests:**
   ```bash
   npm run test
   ```

4. **Build package:**
   ```bash
   npm run build
   ```

### Adding New Features

1. **Create feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes:**
   - Add new functionality
   - Write tests
   - Update documentation

3. **Test changes:**
   ```bash
   npm run test
   npm run lint
   ```

4. **Commit changes:**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

5. **Push changes:**
   ```bash
   git push origin feature/my-feature
   ```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests for specific package
cd packages/core/stellar-sdk
npm run test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Structure

```
tests/
├── unit/                 # Unit tests
│   ├── stellar-sdk.test.ts
│   ├── invisible-wallet.test.ts
│   └── automation.test.ts
├── integration/         # Integration tests
│   ├── api.test.ts
│   ├── contracts.test.ts
│   └── sdk.test.ts
├── e2e/                 # End-to-end tests
│   ├── wallet-flow.test.ts
│   └── payment-flow.test.ts
└── setup.ts             # Test setup
```

## 📦 Building and Deployment

### Building

```bash
# Build all packages
npm run build

# Build specific package
cd packages/core/stellar-sdk
npm run build
```

### Deployment

```bash
# Deploy to testnet
galaxy deploy --network testnet

# Deploy to mainnet
galaxy deploy --network mainnet

# Deploy specific contract
galaxy deploy --contract my-contract
```

## 🔍 Debugging

### Development Tools

1. **VS Code Extensions:**
   - TypeScript
   - ESLint
   - Prettier
   - Stellar

2. **Browser DevTools:**
   - Network tab for API calls
   - Console for logs
   - Application tab for storage

3. **Stellar Laboratory:**
   - [Testnet](https://laboratory.stellar.org/)
   - [Mainnet](https://laboratory.stellar.org/)

### Common Issues

1. **Connection Issues:**
   - Check network configuration
   - Verify API endpoints
   - Check firewall settings

2. **Build Issues:**
   - Clear node_modules
   - Check TypeScript errors
   - Verify dependencies

3. **Test Issues:**
   - Check test environment
   - Verify mocks
   - Check test data

## 📚 Next Steps

Now that you have Galaxy DevKit set up, here are some next steps:

1. **Explore the Examples:**
   - Check out the `examples/` directory
   - Run example projects
   - Study the code

2. **Read the Documentation:**
   - [API Reference](api-reference.md)
   - [Smart Contracts](smart-contracts.md)
   - [SDK Documentation](sdk-documentation.md)

3. **Join the Community:**
   - [Discord](https://discord.gg/galaxy-devkit)
   - [GitHub Discussions](https://github.com/galaxy-devkit/galaxy-devkit/discussions)
   - [Twitter](https://twitter.com/galaxy_devkit)

4. **Contribute:**
   - Fork the repository
   - Create a feature branch
   - Submit a pull request

## 🆘 Getting Help

If you run into issues:

1. **Check the Documentation:**
   - This getting started guide
   - API reference
   - SDK documentation

2. **Search Issues:**
   - [GitHub Issues](https://github.com/galaxy-devkit/galaxy-devkit/issues)
   - [Discord](https://discord.gg/galaxy-devkit)

3. **Ask for Help:**
   - [GitHub Discussions](https://github.com/galaxy-devkit/galaxy-devkit/discussions)
   - [Discord](https://discord.gg/galaxy-devkit)
   - [Email](mailto:support@galaxy-devkit.com)

---

**Happy coding with Galaxy DevKit! 🚀**
