# 🤝 Contributing to Galaxy DevKit

Thank you for your interest in contributing to Galaxy DevKit! This document provides guidelines for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Process](#-development-process)
- [Pull Request Guidelines](#-pull-request-guidelines)
- [Code Standards](#-code-standards)
- [Testing Guidelines](#-testing-guidelines)
- [Documentation](#-documentation)

## 📜 Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct. By participating, you agree to uphold this code.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **Rust** 1.70+
- **Docker Desktop** (for Supabase)
- **Git**

### Setup Development Environment

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/galaxy-devkit.git
cd galaxy-devkit

# 2. Add upstream remote
git remote add upstream https://github.com/galaxy-devkit/galaxy-devkit.git

# 3. Install dependencies
npm install

# 4. Setup Supabase (Database)
# Start Docker Desktop first, then:
npx supabase start

# 5. Configure environment
cp env.example .env.local
# Update .env.local with your Supabase keys from: npx supabase status

# 6. Build the project
npm run build

# 7. Setup and test CLI
cd tools/cli
npm run build
npm link
galaxy --version
galaxy help

# Or test CLI directly without linking
cd ../..
node tools/cli/dist/tools/cli/src/index.js --help
```

### 🔧 Working with the CLI

#### Running CLI Commands Locally

There are three ways to run the CLI during development:

**Option 1: Direct Execution (Fastest for testing)**
```bash
# From project root
npm run build
node tools/cli/dist/tools/cli/src/index.js [command] [options]

# Examples
node tools/cli/dist/tools/cli/src/index.js --version
node tools/cli/dist/tools/cli/src/index.js wallet create --help
node tools/cli/dist/tools/cli/src/index.js oracle price XLM/USD
```

**Option 2: Global Link (Best for development)**
```bash
# Link CLI globally
cd tools/cli
npm run build
npm link

# Now use 'galaxy' command anywhere
galaxy --version
galaxy help
galaxy wallet list
galaxy oracle price XLM/USD

# Unlink when done
npm unlink -g @galaxy/cli
```

**Option 3: Create Alias (Convenient)**
```bash
# Add to ~/.bashrc or ~/.zshrc
alias galaxy="node $(pwd)/tools/cli/dist/tools/cli/src/index.js"

# Reload shell
source ~/.bashrc  # or source ~/.zshrc

# Use alias
galaxy help
```

#### CLI Development Workflow

**1. Create New Command:**
```bash
# Create command file
mkdir -p tools/cli/src/commands/my-command
touch tools/cli/src/commands/my-command/index.ts

# Add command implementation
# See existing commands for examples
```

**2. Register Command:**
```typescript
// tools/cli/src/index.ts
import { myCommand } from './commands/my-command/index.js';

// Register command
program.addCommand(myCommand);
```

**3. Build and Test:**
```bash
cd tools/cli

# Build TypeScript
npm run build

# Test command
node dist/tools/cli/src/index.js my-command --help

# Or if linked
galaxy my-command --help
```

**4. Add Tests:**
```bash
# Create test file
touch tools/cli/src/commands/my-command/__tests__/index.test.ts

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

**5. Update Documentation:**
- Update `tools/cli/README.md`
- Update `docs/guides/cli-guide.md`
- Add examples to `docs/examples/`

#### Available CLI Commands

| Command | Description |
|---------|-------------|
| `galaxy create <name>` | Create new Stellar DApp project |
| `galaxy init` | Initialize Galaxy DevKit in current directory |
| `galaxy build` | Build the project |
| `galaxy dev` | Start development server |
| `galaxy deploy` | Deploy to production |
| `galaxy wallet <cmd>` | Wallet management (create, import, list, balance, send) |
| `galaxy blend <cmd>` | Blend Protocol operations (stats, supply, borrow, withdraw, repay) |
| `galaxy oracle <cmd>` | Oracle price data (price, history, sources, validate) |
| `galaxy watch <cmd>` | Real-time monitoring (account, transaction, oracle, contract, network, dashboard) |
| `galaxy interactive` | Launch interactive REPL mode |
| `galaxy help` | Show help information |

#### CLI Testing Checklist

Before submitting CLI changes:

- [ ] Command works with direct execution
- [ ] Command works when linked globally
- [ ] Help text is clear and accurate
- [ ] Examples are provided
- [ ] Error messages are helpful
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Documentation updated
- [ ] README updated
```

### 🗄️ Database Setup

**Each contributor needs their own Supabase instance:**

```bash
# Start Docker Desktop
open -a Docker

# Start Supabase local development
npx supabase start

# Verify database is running
npx supabase status

# Access Supabase Studio (Web Interface)
open http://127.0.0.1:54323
```

**Database URLs (for development):**
- **API URL**: `http://127.0.0.1:54321`
- **Database URL**: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **GraphQL URL**: `http://127.0.0.1:54321/graphql/v1`

**Available Tables:**
- `users` - User management and profiles
- `wallets` - Stellar wallet management
- `contracts` - Smart contract deployments
- `automations` - Trading automation rules
- `transactions` - Transaction history
- `market_data` - Market data and prices

### 🔧 Environment Variables

**Copy the example file:**
```bash
cp env.example .env.local
```

**Update the values in `.env.local`:**
- Get your Supabase keys from: `npx supabase status`
- Configure Stellar network (testnet/mainnet)
- Set development preferences

**Example `.env.local`:**
```bash
# Supabase Configuration
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your_anon_key_from_supabase_status
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_from_supabase_status

# Stellar Network
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
```

## 🔄 Development Process

### 1. Create Feature Branch

```bash
# Create and switch to feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/your-bug-description
```

### 2. Make Changes

- Write your code following the [Code Standards](#-code-standards)
- Add tests for new functionality
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Test specific package
cd packages/core/stellar-sdk
npm test

# Test CLI
cd tools/cli
npm test
galaxy help
```

### 4. Commit Changes

```bash
# Stage changes
git add .

# Commit with conventional commit message
git commit -m "feat: add new CLI command for wallet creation"
```

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

## 📝 Pull Request Guidelines

### Before Submitting

- [ ] Code follows project standards
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] Commit messages follow conventional format

### PR Title Format

```
type(scope): brief description

Examples:
feat(cli): add wallet creation command
fix(sdk): resolve transaction signing issue
docs(api): update endpoint documentation
test(contracts): add unit tests for swap function
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No commented code
```

## 📏 Code Standards

### TypeScript/JavaScript

#### File Structure
```typescript
/**
 * @fileoverview Brief description of file purpose
 * @author Your Name
 * @version 1.0.0
 * @since 2024-12-01
 */

// Imports
import { SomeType } from './types';

// Interfaces
export interface MyInterface {
  property: string;
}

// Functions
/**
 * Brief description of function
 * @param param - Parameter description
 * @returns Return value description
 */
export function myFunction(param: string): string {
  return param;
}
```

#### Naming Conventions
- **Variables**: `camelCase`
- **Functions**: `camelCase`
- **Classes**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`
- **Files**: `kebab-case.ts`

#### Code Style
```typescript
// Good
const walletAddress = 'GABC123...';
const isConnected = true;

// Bad
const wallet_address = 'GABC123...';
const is_connected = true;
```

### Rust

#### File Structure
```rust
//! Brief description of module purpose
//! 
//! This module provides functionality for...

use soroban_sdk::{contract, contractimpl, Env};

/// Brief description of struct
#[contract]
pub struct MyContract;

/// Brief description of implementation
#[contractimpl]
impl MyContract {
    /// Brief description of function
    /// 
    /// # Arguments
    /// * `env` - The environment
    /// * `param` - Parameter description
    /// 
    /// # Returns
    /// * `ReturnType` - Return value description
    pub fn my_function(env: Env, param: i128) -> i128 {
        param
    }
}
```

#### Naming Conventions
- **Variables**: `snake_case`
- **Functions**: `snake_case`
- **Structs**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE`

### Documentation

#### JSDoc for TypeScript
```typescript
/**
 * Creates a new Stellar wallet
 * @param config - Wallet configuration object
 * @param config.userId - User identifier
 * @param config.network - Stellar network (testnet/mainnet)
 * @returns Promise resolving to wallet object
 * @throws {Error} When wallet creation fails
 * @example
 * ```typescript
 * const wallet = await createWallet({
 *   userId: 'user123',
 *   network: 'testnet'
 * });
 * ```
 */
export async function createWallet(config: WalletConfig): Promise<Wallet> {
  // Implementation
}
```

#### Rust Documentation
```rust
/// Creates a new smart contract instance
/// 
/// This function initializes a new contract with the specified parameters.
/// 
/// # Arguments
/// * `env` - The Soroban environment
/// * `admin` - Admin address for the contract
/// * `fee_rate` - Fee rate in basis points (100 = 1%)
/// 
/// # Returns
/// * `ContractId` - The deployed contract ID
/// 
/// # Panics
/// * If admin address is invalid
/// * If fee rate is greater than 10000 (100%)
/// 
/// # Examples
/// ```rust
/// let contract_id = create_contract(env, admin, 100);
/// ```
pub fn create_contract(env: Env, admin: Address, fee_rate: u32) -> ContractId {
    // Implementation
}
```

## 🧪 Testing Guidelines

### Unit Tests

#### TypeScript Tests
```typescript
// tests/stellar-service.test.ts
import { StellarService } from '../src/services/stellar-service';

describe('StellarService', () => {
  let stellarService: StellarService;

  beforeEach(() => {
    stellarService = new StellarService({
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org'
    });
  });

  describe('createWallet', () => {
    it('should create wallet with valid config', async () => {
      const config = {
        userId: 'test-user',
        network: 'testnet'
      };

      const wallet = await stellarService.createWallet(config);

      expect(wallet).toBeDefined();
      expect(wallet.publicKey).toMatch(/^G[A-Z0-9]{55}$/);
    });

    it('should throw error with invalid config', async () => {
      const config = {
        userId: '',
        network: 'invalid'
      };

      await expect(stellarService.createWallet(config))
        .rejects.toThrow('Invalid configuration');
    });
  });
});
```

#### Rust Tests
```rust
// src/test.rs
use super::*;

#[test]
fn test_create_contract() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    let contract_id = create_contract(env.clone(), admin.clone(), 100);
    
    assert!(contract_id.is_valid());
}

#[test]
#[should_panic(expected = "Invalid fee rate")]
fn test_create_contract_invalid_fee() {
    let env = Env::default();
    let admin = Address::generate(&env);
    
    create_contract(env, admin, 10001); // Should panic
}
```

### Integration Tests

```typescript
// tests/integration/cli.test.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('CLI Integration', () => {
  it('should create project successfully', async () => {
    const { stdout } = await execAsync('galaxy create test-project');
    
    expect(stdout).toContain('Project created successfully');
  });
});
```

### Test Coverage

```bash
# Run tests with coverage
npm run test:coverage

# Coverage should be > 80%
```

## 📚 Documentation

### Code Documentation

- **All public functions** must have JSDoc/Rust docs
- **Complex logic** must have inline comments
- **API endpoints** must be documented
- **CLI commands** must have help text

### README Updates

When adding new features:
- Update relevant README sections
- Add usage examples
- Update installation instructions if needed

### API Documentation

For new API endpoints:
- Add to `docs/api-reference.md`
- Include request/response examples
- Document error codes

## 🐛 Bug Reports

### Before Reporting

1. Check existing issues
2. Test with latest version
3. Reproduce the bug
4. Gather relevant information

### Bug Report Template

```markdown
## Bug Description
Brief description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g. macOS 13.0]
- Node.js: [e.g. 18.17.0]
- Galaxy CLI: [e.g. 1.0.0]

## Additional Context
Any other relevant information
```

## ✨ Feature Requests

### Before Requesting

1. Check existing feature requests
2. Consider if it fits project scope
3. Think about implementation complexity

### Feature Request Template

```markdown
## Feature Description
Brief description of the feature

## Use Case
Why is this feature needed?

## Proposed Solution
How should this feature work?

## Alternatives Considered
What other approaches were considered?

## Additional Context
Any other relevant information
```

## 🏷️ Release Process

### Version Bumping

- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Minor** (1.0.0 → 1.1.0): New features
- **Major** (1.0.0 → 2.0.0): Breaking changes

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped
- [ ] Release notes prepared

## 🆘 Getting Help

- **Telegram Discussions**: https://t.me/+ZrTHg48xDv0yYTlh
- **GitHub Issues**: For bugs and feature requests
- **Discord**: https://discord.gg/mRsbdaxF
- **Documentation**: For detailed guides

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to Galaxy DevKit!** 🌟
