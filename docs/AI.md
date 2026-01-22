# 🤖 AI Development Guide - Galaxy DevKit

> **Read this first if you're an AI assistant helping with Galaxy DevKit development**

## 🎯 Project Overview

**Galaxy DevKit** is a comprehensive development framework for the Stellar blockchain ecosystem that provides:
- **Invisible Wallet System**: User-friendly wallet management without exposing private keys
- **DeFi Protocol Integration**: Blend, Soroswap, and other Stellar DeFi protocols
- **Oracle Integration**: Price feeds and data oracles for Stellar
- **Automation Engine**: IFTTT-style automation for DeFi operations
- **Soroban Smart Contracts**: Rust-based smart contracts
- **Multi-API Architecture**: REST, GraphQL, WebSocket APIs
- **CLI Tools**: Command-line interface for developers
- **TypeScript SDK**: Client SDK for easy integration

## 📁 Project Structure

```
galaxy-devkit/
├── packages/
│   ├── core/                          # Core functionality
│   │   ├── stellar-sdk/              # Stellar operations wrapper
│   │   ├── invisible-wallet/         # Wallet management system
│   │   ├── automation/               # DeFi automation engine
│   │   ├── defi-protocols/           # 🆕 DeFi integrations (Blend, Soroswap)
│   │   └── oracles/                  # 🆕 Oracle integrations
│   ├── api/                          # API layers
│   │   ├── rest/                     # Express REST API
│   │   ├── graphql/                  # Apollo GraphQL API
│   │   └── websocket/                # Socket.io WebSocket API
│   ├── sdk/                          # Client SDKs
│   │   └── typescript/               # TypeScript SDK
│   ├── contracts/                    # Soroban smart contracts (Rust)
│   │   ├── smart-swap/               # Automated swap contract
│   │   ├── security-limits/          # Risk management contract
│   │   ├── oracle-aggregator/        # 🆕 Price oracle contract
│   │   └── yield-vault/              # 🆕 Yield aggregator contract
│   └── templates/                    # Project templates
└── tools/
    ├── cli/                          # CLI implementation
    └── docs/                         # Documentation generators
```

## 🧠 Key Concepts

### 1. Invisible Wallet System
Wallets are created with email/password only. Private keys are encrypted (AES-256-GCM) and stored securely. Users never see or manage private keys directly.

**Files to understand:**
- `packages/core/invisible-wallet/src/services/invisible-wallet.service.ts`
- `packages/core/invisible-wallet/src/services/key-managment.service.ts`
- `packages/core/invisible-wallet/src/types/wallet.types.ts`

### 2. Stellar SDK Wrapper
Abstraction layer over `@stellar/stellar-sdk` providing simplified interfaces for:
- Wallet creation (random or from mnemonic BIP39/BIP44)
- Account operations (balance, info, history)
- Payments and transactions
- Trustlines for custom assets
- Network switching (testnet/mainnet)
- **Sponsored Reserves**: Allow sponsors to pay base reserves for other accounts

**Files to understand:**
- `packages/core/stellar-sdk/src/services/stellar-service.ts`
- `packages/core/stellar-sdk/src/types/stellar-types.ts`

### 2.1 Sponsored Reserves System
Allows sponsor accounts to pay base reserves for another account's ledger entries. Essential for user onboarding without requiring new users to hold XLM.

**Supported Entry Types:**
- Accounts (2 base reserves = 1 XLM)
- Trustlines (1 base reserve = 0.5 XLM)
- Offers (1 base reserve = 0.5 XLM)
- Data entries (1 base reserve = 0.5 XLM)
- Signers (1 base reserve = 0.5 XLM)
- Claimable balances (1 base reserve = 0.5 XLM)

**Files to understand:**
- `packages/core/stellar-sdk/src/sponsored-reserves/services/sponsored-reserves-manager.ts` - Main manager class
- `packages/core/stellar-sdk/src/sponsored-reserves/types/sponsored-reserves-types.ts` - Type definitions
- `packages/core/stellar-sdk/src/sponsored-reserves/builders/` - Operation builders
- `packages/core/stellar-sdk/src/sponsored-reserves/templates/` - Common patterns

**Usage Example:**
```typescript
import {
  SponsoredReservesManager,
  UserOnboardingTemplate,
  calculateOnboardingCost
} from '@galaxy/core-stellar-sdk';

// Create manager
const manager = new SponsoredReservesManager(networkConfig);

// Calculate cost before sponsoring
const config = {
  sponsorPublicKey: 'GSPONSOR...',
  newUserPublicKey: 'GNEWUSER...',
  trustlines: [{ assetCode: 'USDC', assetIssuer: 'GUSDC...' }],
};
const cost = calculateOnboardingCost(config);
console.log('Total cost:', cost.totalCost, 'XLM');

// Check sponsor eligibility
const eligibility = await manager.checkSponsorshipEligibility(
  'GSPONSOR...',
  { sponsorPublicKey: 'GSPONSOR...', sponsoredPublicKey: 'GNEWUSER...', entryType: 'account' }
);

// Onboard user with sponsored account + trustlines
const template = new UserOnboardingTemplate(networkConfig);
const result = await template.onboardUser(config, sponsorSecret, newUserSecret);
console.log('Transaction:', result.hash);
```

**Transaction Structure (Stellar requirement):**
```typescript
// Sponsor signs the whole transaction
// Sponsored account is source for endSponsoringFutureReserves
new TransactionBuilder(sponsorAccount, { fee, networkPassphrase })
  .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: sponsored }))
  .addOperation(/* sponsored operation with source: sponsored */)
  .addOperation(Operation.endSponsoringFutureReserves({ source: sponsored }))
  .build();
// Sign with both sponsor AND sponsored keypairs
```

**Security Considerations:**
- Private keys passed to methods but never stored
- Both sponsor and sponsored must sign transactions
- Sponsors can revoke sponsorship (transfers reserve back to sponsored)
- Use `checkSponsorshipEligibility()` before operations

### 3. Automation Engine
Event-driven system for DeFi automation with:
- **Triggers**: CRON, price, volume, blockchain events
- **Conditions**: Complex logic with AND/OR operators
- **Actions**: Payments, swaps, contract calls, notifications
- **Metrics**: Success rate, execution time, fees spent

**Files to understand:**
- `packages/core/automation/src/services/automation.service.ts`
- `packages/core/automation/src/types/automation-types.ts`

### 4. DeFi Protocol Integration
Integration layer for Stellar DeFi protocols providing unified interfaces for:
- **Blend Protocol**: Lending and borrowing
- **Soroswap**: Decentralized exchange
- **Aquarius**: Liquidity pools
- **Custom DEX aggregators**

**Architecture Pattern**: Factory pattern with abstract base class
- All protocols implement `IDefiProtocol` interface
- Common functionality in `BaseProtocol` abstract class
- Protocol-specific implementations in separate classes
- Factory service for protocol instantiation

**Key Components:**

**Base Interface & Types:**
- `packages/core/defi-protocols/src/types/protocol-interface.ts` - IDefiProtocol interface
- `packages/core/defi-protocols/src/types/defi-types.ts` - Type definitions
- `packages/core/defi-protocols/src/protocols/base-protocol.ts` - Abstract base class

**Services:**
- `packages/core/defi-protocols/src/services/protocol-factory.ts` - Factory for protocol instantiation

**Utilities:**
- `packages/core/defi-protocols/src/utils/validation.ts` - Input validation helpers
- `packages/core/defi-protocols/src/constants/` - Network configs and constants

**Usage Example:**
```typescript
import { getProtocolFactory, ProtocolConfig } from '@galaxy/core-defi-protocols';

// Create protocol configuration
const config: ProtocolConfig = {
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: TESTNET_CONFIG,
  contractAddresses: {
    pool: 'CBLEND_POOL_ADDRESS'
  },
  metadata: {}
};

// Get protocol instance from factory
const factory = getProtocolFactory();
const blend = factory.createProtocol(config);

// Initialize protocol
await blend.initialize();

// Supply assets
const result = await blend.supply(
  walletAddress,
  privateKey,
  { code: 'USDC', issuer: 'ISSUER_ADDRESS', type: 'credit_alphanum4' },
  '1000'
);

// Get position info
const position = await blend.getPosition(walletAddress);
console.log('Health Factor:', position.healthFactor);
```

**Protocol Implementation Pattern:**
When adding a new protocol (e.g., Blend, Soroswap):
1. Create protocol directory: `src/protocols/[protocol-name]/`
2. Extend `BaseProtocol` abstract class
3. Implement required abstract methods
4. Register in factory: `factory.register('protocol-id', ProtocolClass)`
5. Add protocol-specific types to `defi-types.ts`
6. Write comprehensive tests

**Security Considerations:**
- Private keys are passed to methods but never stored
- All inputs are validated (addresses, amounts, assets)
- Transaction building includes slippage protection
- Health factor checks before risky operations

### 5. Oracle System (🆕 To be implemented)
Price and data oracles for Stellar:
- On-chain oracle contracts (Soroban)
- Off-chain oracle aggregators
- Price feeds for XLM, USDC, and other assets
- TWAP (Time-Weighted Average Price) calculations

**Target files:**
- `packages/core/oracles/src/services/oracle-service.ts`
- `packages/contracts/oracle-aggregator/src/lib.rs`

## 🛠️ Tech Stack

### Backend
- **Language**: TypeScript 5.9+
- **Runtime**: Node.js 18+
- **Framework**: Express.js, Apollo Server
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Stellar (Horizon API)
- **Smart Contracts**: Rust (Soroban SDK)

### Libraries
- `@stellar/stellar-sdk`: Stellar operations
- `bip39`: Mnemonic generation
- `ed25519-hd-key`: Key derivation
- `crypto`: Encryption (AES-256-GCM)
- `node-cron`: Scheduled tasks
- `socket.io`: WebSocket server

## 📋 Development Workflow

### 1. Setup Development Environment
```bash
# Clone repository
git clone https://github.com/galaxy-devkit/galaxy-devkit.git
cd galaxy-devkit

# Install dependencies
npm install

# Start Supabase (requires Docker)
npx supabase start

# Build all packages
npm run build

# Run tests
npm test
```

### 2. Working with Monorepo
```bash
# Build specific package
cd packages/core/stellar-sdk
npm run build

# Run package tests
npm test

# Clean build artifacts
npm run clean
```

### 3. CLI Development
```bash
cd tools/cli
npm run build
npm link
galaxy help
```

### 4. Contract Development (Rust)
```bash
cd packages/contracts/smart-swap
cargo build --target wasm32-unknown-unknown --release
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/smart_swap.wasm --network testnet
```

## 🎨 Code Style Guidelines

### TypeScript
- Use **strict mode**
- Prefer `interface` over `type` for object shapes
- Use `async/await` over promises
- Always specify return types for functions
- Use descriptive variable names

**Example:**
```typescript
// ✅ Good
async function createWallet(config: WalletConfig, password: string): Promise<Wallet> {
  const keypair = Keypair.random();
  const encryptedKey = await encryptPrivateKey(keypair.secret(), password);
  return { id: generateId(), publicKey: keypair.publicKey(), privateKey: encryptedKey };
}

// ❌ Bad
async function create(c: any, p: any) {
  const k = Keypair.random();
  return { id: id(), pk: k.publicKey() };
}
```

### Rust (Soroban Contracts)
- Follow official Soroban style guide
- Use descriptive enum variants
- Add documentation comments (`///`)
- Handle errors explicitly
- Test all public functions

**Example:**
```rust
/// Creates a new swap condition
///
/// # Arguments
/// * `env` - Contract environment
/// * `owner` - Address of the condition owner
/// * `source_asset` - Asset to swap from
/// * `destination_asset` - Asset to swap to
pub fn create_swap_condition(
    env: &Env,
    owner: Address,
    source_asset: Symbol,
    destination_asset: Symbol,
) -> u64 {
    // Implementation
}
```

## 🔍 Common Tasks

### Adding a new DeFi protocol integration
1. Create protocol directory: `packages/core/defi-protocols/src/protocols/[protocol-name]/`
2. Create protocol class extending `BaseProtocol` abstract class
3. Implement all required abstract methods from `IDefiProtocol` interface
4. Add protocol-specific types to `src/types/defi-types.ts`
5. Register protocol in factory: `factory.register('protocol-id', ProtocolClass)`
6. Add comprehensive tests in `__tests__/protocols/[protocol-name]/`
7. Update `docs/AI.md` and package README with usage examples
8. Add example to `docs/examples/defi-protocols/`

**Example Protocol Implementation:**
```typescript
// src/protocols/blend/blend-protocol.ts
import { BaseProtocol } from '../base-protocol';
import { ProtocolType, TransactionResult, Asset } from '../../types/defi-types';

export class BlendProtocol extends BaseProtocol {
  protected getProtocolType(): ProtocolType {
    return ProtocolType.LENDING;
  }

  protected async setupProtocol(): Promise<void> {
    // Initialize Blend-specific connections
    this.poolContract = this.getContractAddress('pool');
  }

  public async supply(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(asset);
    this.validateAmount(amount);

    // Implement Blend-specific supply logic
    // Build and submit transaction
    // Return transaction result
  }

  // Implement other required methods...
}
```

### Adding a new CLI command
1. Create command file: `tools/cli/src/commands/[command-name].ts`
2. Use Commander.js pattern
3. Register command in `tools/cli/src/index.ts`
4. Add command description and examples
5. Test command: `galaxy [command-name] --help`

### Adding a new smart contract
1. Create contract directory: `packages/contracts/[contract-name]/`
2. Add `Cargo.toml` with Soroban dependencies
3. Implement contract in `src/lib.rs`
4. Add tests in `src/test.rs`
5. Build: `cargo build --target wasm32-unknown-unknown --release`
6. Deploy to testnet for testing

### Extending the automation engine
1. Add new trigger type to `TriggerType` enum
2. Add new execution type to `ExecutionType` enum
3. Implement trigger logic in `CronManager` or new manager
4. Implement execution logic in `ExecutionEngine`
5. Add configuration types to `ExecutionConfig` interface
6. Update tests and documentation

## 🐛 Debugging Tips

### Wallet Issues
- Check encryption/decryption: Verify password and salt
- Check Horizon connectivity: `curl https://horizon-testnet.stellar.org`
- Verify account is funded: Testnet friendbot or manual funding required
- Check Supabase connection: Verify `.env` variables

### Transaction Failures
- Insufficient balance: Check XLM balance for fees
- Sequence number: Account sequence may be outdated
- Network mismatch: Verify testnet vs mainnet
- Invalid destination: Check destination account exists
- Trustline missing: Custom assets require trustlines

### Contract Errors
- Check contract deployment: Verify WASM was deployed
- Function signature: Ensure correct parameters
- Authorization: Check if function requires auth
- Storage limits: Soroban has storage constraints

## 📚 Important Files for AI Context

### Core Services
- `packages/core/stellar-sdk/src/services/stellar-service.ts` - Main Stellar operations
- `packages/core/invisible-wallet/src/services/invisible-wallet.service.ts` - Wallet management
- `packages/core/automation/src/services/automation.service.ts` - Automation engine

### Type Definitions
- `packages/core/stellar-sdk/src/types/stellar-types.ts` - Stellar types
- `packages/core/invisible-wallet/src/types/wallet.types.ts` - Wallet types
- `packages/core/automation/src/types/automation-types.ts` - Automation types

### Smart Contracts
- `packages/contracts/smart-swap/src/lib.rs` - Smart swap contract
- `packages/contracts/security-limits/src/lib.rs` - Security limits contract

### CLI
- `tools/cli/src/index.ts` - CLI entry point
- `tools/cli/src/commands/` - CLI commands

### APIs
- `packages/api/rest/src/` - REST API implementation
- `packages/api/graphql/src/` - GraphQL API implementation
- `packages/api/websocket/src/` - WebSocket API implementation

## 🎯 Current Development Focus (Phase System)

Galaxy DevKit follows a **4-phase development roadmap** with 20 issues per phase:

### Phase 1: Foundation & Core (Issues #1-#20)
- DeFi protocol integration architecture
- Oracle system foundation
- Enhanced wallet features
- CLI improvements

### Phase 2: DeFi Integration (Issues #21-#40)
- Blend protocol integration
- Soroswap integration
- DEX aggregator
- Oracle contracts

### Phase 3: Advanced Features (Issues #41-#60)
- Yield strategies
- Advanced automation
- Risk management
- Analytics dashboard

### Phase 4: Enterprise & Scale (Issues #61-#80)
- Multi-sig wallets
- Team accounts
- Audit logging
- Performance optimization

**All issues follow standardized templates** (see `.github/ISSUE_TEMPLATE/`).

## 🤝 Contributing Guidelines

### Issue Creation
- Use issue templates (feature, bug, documentation)
- Add appropriate labels (phase-1, defi, oracle, wallet, etc.)
- Reference related issues with `#issue-number`
- Assign to project milestone

### Pull Request Process
1. Create feature branch: `git checkout -b feature/issue-123-description`
2. Make changes and commit: `git commit -m "feat: description (#123)"`
3. Push and create PR: Reference issue in PR description
4. Ensure CI passes (linting, tests, build)
5. Wait for review and address feedback

### Commit Message Format
```
<type>(<scope>): <description> (#issue-number)

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
Scopes: `wallet`, `stellar-sdk`, `automation`, `cli`, `contracts`, `defi`, `oracle`

**Examples:**
```
feat(defi): add Blend protocol integration (#25)
fix(wallet): resolve encryption issue with special characters (#42)
docs(oracle): add oracle service documentation (#33)
```

## 🔗 External Resources

### Stellar Documentation
- Stellar Docs: https://developers.stellar.org/
- Soroban Docs: https://soroban.stellar.org/
- Horizon API: https://developers.stellar.org/api/horizon

### DeFi Protocols
- Blend Protocol: https://blend.capital/
- Soroswap: https://soroswap.finance/
- Aquarius: https://aquarius.network/

### Tools
- Stellar Laboratory: https://laboratory.stellar.org/
- Stellar Expert: https://stellar.expert/
- StellarChain: https://stellarchain.io/

## ❓ FAQ for AI Development

### Q: How do I test wallet creation without Supabase?
A: Mock Supabase client or use in-memory storage. See `__tests__/setup.ts` for examples.

### Q: How do I simulate Stellar network for testing?
A: Use `stellar-sdk` test utilities or run local Stellar quickstart docker.

### Q: Where do I add new DeFi protocol integrations?
A: Create directory in `packages/core/defi-protocols/src/protocols/[protocol]/` following `IDefiProtocol` interface.

### Q: How do I add new oracle sources?
A: Implement `IOracleSource` interface in `packages/core/oracles/src/sources/`.

### Q: How do I extend automation triggers?
A: Add to `TriggerType` enum and implement in respective manager (CronManager, EventManager, etc.).

---

**Last Updated**: 2024-01-15
**Maintained By**: Galaxy DevKit Team
**For Questions**: Open an issue with label `question`
