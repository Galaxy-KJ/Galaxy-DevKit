# 📚 Galaxy DevKit Documentation

Welcome to the complete documentation for Galaxy DevKit - the ultimate development framework for the Stellar ecosystem.

## 🚀 What is Galaxy DevKit?

Galaxy DevKit is a comprehensive development framework that provides both **APIs** and **CLI tools** to build Stellar applications with ease.

### Key Features
- **🌐 APIs** - REST, GraphQL, WebSocket endpoints
- **🛠️ CLI Tools** - Command-line interface for project creation
- **📦 SDKs** - TypeScript, Python, JavaScript SDKs
- **🔗 Smart Contracts** - Rust-based Soroban contracts
- **🗄️ Database** - Supabase integration

## 📋 Documentation Structure

### 📖 [User Guides](./guides/)
Complete guides for using Galaxy DevKit to build Stellar applications.

- **[Getting Started](./guides/getting-started.md)** - Quick start guide
- **[User Guide](./guides/user-guide.md)** - Complete user documentation
- **[CLI Guide](./guides/cli-guide.md)** - Command line interface guide

### 🌐 [API Documentation](./api/)
Complete API documentation for Galaxy DevKit services.

- **[API Reference](./api/api-reference.md)** - Complete API documentation
- **[REST API](./api/rest-api.md)** - REST endpoints documentation
- **[GraphQL API](./api/graphql-api.md)** - GraphQL schema and queries
- **[WebSocket API](./api/websocket-api.md)** - Real-time WebSocket API
- **[SDK Examples](./api/sdk-examples.md)** - SDK usage examples

### 📚 [Examples](./examples/)
Real-world examples and use cases for Galaxy DevKit.

- **[Examples Overview](./examples/examples.md)** - Complete examples documentation
- **[Payment Apps](./examples/payment-apps.md)** - Payment processing examples
- **[DeFi Platforms](./examples/defi-platforms.md)** - DeFi application examples
- **[NFT Marketplaces](./examples/nft-marketplaces.md)** - NFT platform examples
- **[Gaming Applications](./examples/gaming-apps.md)** - Gaming integration examples

### 🏗️ [Architecture](./architecture/)
Comprehensive architecture documentation for Galaxy DevKit.

- **[System Architecture](./architecture/architecture.md)** - Complete system architecture
- **[API Architecture](./architecture/api-architecture.md)** - API design and structure
- **[CLI Architecture](./architecture/cli-architecture.md)** - CLI tool architecture
- **[Smart Contract Architecture](./architecture/smart-contract-architecture.md)** - Contract design
- **[Database Architecture](./architecture/database-architecture.md)** - Data layer design
- **[Security Architecture](./architecture/security-architecture.md)** - Security design
- **[Deployment Architecture](./architecture/deployment-architecture.md)** - Deployment strategies

## 🎯 Choose Your Path

### For API Users
Perfect for developers who want to integrate Stellar functionality into existing applications.

**Start with:** [Getting Started Guide](./guides/getting-started.md)

**Best for:**
- Mobile apps
- Web applications
- Backend services
- Third-party integrations

### For CLI Users
Perfect for developers who want to create full-stack Stellar applications from scratch.

**Start with:** [User Guide](./guides/user-guide.md)

**Best for:**
- DeFi platforms
- NFT marketplaces
- Trading applications
- Custom Stellar solutions

## 🚀 Quick Start

### Install CLI
```bash
npm install -g @galaxy/cli
```

### Create Project
```bash
galaxy create my-stellar-app
cd my-stellar-app
galaxy dev
```

### Use APIs
```typescript
import { GalaxySDK } from '@galaxy/sdk-typescript';

const galaxy = new GalaxySDK({
  apiKey: 'your-api-key',
  network: 'testnet'
});

const wallet = await galaxy.wallets.create({
  userId: 'user123'
});
```

## 🔗 External Resources

- **GitHub Repository**: [github.com/galaxy-devkit/galaxy-devkit](https://github.com/galaxy-devkit/galaxy-devkit)
- **Discord Community**: [discord.gg/galaxy-devkit](https://discord.gg/galaxy-devkit)
- **Stellar Documentation**: [developers.stellar.org](https://developers.stellar.org)
- **Supabase Documentation**: [supabase.com/docs](https://supabase.com/docs)

## 🤝 Contributing

Want to contribute to Galaxy DevKit? Check out our [Contributing Guide](../CONTRIBUTING.md) and [README](../README.md) for developers.

## 📄 License

Galaxy DevKit is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

## Smart Wallet Docs

- [Smart Wallet API Reference](./smart-wallet/api-reference.md)
- [Smart Wallet Integration Guide](./smart-wallet/integration-guide.md)
- [Smart Wallet Flow](./architecture/smart-wallet-flow.md)

---

**Built with ❤️ for the Stellar ecosystem** 🌟
