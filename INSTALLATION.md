# 📦 Installation Guide

Galaxy DevKit packages are published to **npm public registry**.

---

## 📦 Installing Packages

### Install Core DeFi Protocols

```bash
npm install @galaxy-kj/core-defi-protocols
```

### Install Oracles System

```bash
npm install @galaxy-kj/core-oracles
```

### Install Wallet System

```bash
npm install @galaxy-kj/core-invisible-wallet
```

### Install Stellar SDK Extensions

```bash
npm install @galaxy-kj/core-stellar-sdk
```

### Install Automation System

```bash
npm install @galaxy-kj/core-automation
```

### Install CLI Tool (Global)

```bash
npm install -g @galaxy-kj/cli
```

### Install All Core Packages

```bash
npm install @galaxy-kj/core-defi-protocols @galaxy-kj/core-oracles @galaxy-kj/core-invisible-wallet @galaxy-kj/core-stellar-sdk @galaxy-kj/core-automation
```

---

## 🚀 Quick Start

### Using DeFi Protocols (TypeScript/JavaScript)

```typescript
import { BlendProtocol } from '@galaxy-kj/core-defi-protocols';

// Initialize Blend Protocol
const blend = new BlendProtocol({
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    type: 'testnet'
  },
  contractAddresses: {
    pool: 'YOUR_POOL_ADDRESS'
  }
});

await blend.initialize();

// Supply assets
const result = await blend.supply(
  walletAddress,
  privateKey,
  { code: 'USDC', issuer: 'ISSUER_ADDRESS' },
  '100'
);

console.log('Transaction:', result.hash);
```

### Using the CLI

```bash
# Install globally
npm install -g @galaxy-kj/cli

# Use the CLI
galaxy --help

# Blend commands
galaxy blend stats
galaxy blend supply --asset USDC --amount 100
```

---

## 🔧 Troubleshooting

### Error: 404 Not Found

**Cause:** Package doesn't exist or typo in package name.

**Solution:**
- Verify package name: `@galaxy-kj/core-defi-protocols`
- Check available packages: https://www.npmjs.com/search?q=%40galaxy-kj

### Slow Installation

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install @galaxy-kj/core-defi-protocols
```

---

## 📚 Next Steps

- [Read the Documentation](./docs/)
- [View Examples](./examples/)
- [Check the Roadmap](./ROADMAP.md)
- [Contribute](./CONTRIBUTING.md)

---

## 🆘 Getting Help

- [Open an Issue](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues)
- [View Documentation](./docs/)
