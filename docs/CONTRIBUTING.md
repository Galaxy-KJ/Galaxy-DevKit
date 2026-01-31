# 🤝 Contributing to Galaxy DevKit

## 📋 Table of Contents
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Documentation Requirements](#documentation-requirements)
- [AI-Friendly Contributions](#ai-friendly-contributions)
- [Code Standards](#code-standards)
- [Pull Request Process](#pull-request-process)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Rust 1.70+ (for Soroban contracts)
- Docker Desktop (for Supabase local development)
- Git

### Setup
```bash
git clone https://github.com/galaxy-devkit/galaxy-devkit.git
cd galaxy-devkit
npm install
npx supabase start
npm run build
npm test
```

---

## 🔄 Development Workflow

### 1. Pick an Issue
- Browse [open issues](https://github.com/galaxy-devkit/galaxy-devkit/issues)
- Look for `good-first-issue` or `help-wanted` labels
- Comment on the issue to claim it

### 2. Create a Branch
```bash
git checkout -b feature/issue-123-description
```

### 3. Read Required Documentation
**Before writing code, read these docs:**
- `docs/AI.md` - Understand project patterns
- `docs/ARCHITECTURE.md` - System architecture
- Package-specific README in relevant package
- Related issue descriptions

### 4. Implement the Feature
Follow the implementation guide in the issue

### 5. Write Tests
```bash
cd packages/[package-name]
npm test
```

### 6. **Update Documentation** (REQUIRED)
**This is mandatory before submitting PR!**

See [Documentation Requirements](#documentation-requirements) below.

### 7. Create Pull Request
Use the PR template and fill ALL sections.

---

## 📚 Documentation Requirements

### Every PR Must Update:

#### 1. ` docs/AI.md` (Required)
**When to update**: Every PR that adds/modifies functionality

**What to add**:
```markdown
### [Component Name] - [Feature Name]

**Purpose**: Brief description

**Files**:
- `path/to/file.ts`

**Usage Example**:
```typescript
// Clear, working example
```

**AI Implementation Notes**:
- Pattern to follow
- Common pitfalls
- Edge cases to handle
```

#### 2. Package README (Required if you modified a package)
**Location**: `packages/[package-name]/README.md`

**What to update**:
- API reference section
- Usage examples
- New exports

**Example**:
```markdown
## API Reference

### New Function: `functionName()`

Description of what it does.

**Parameters**:
- `param1` (type): Description
- `param2` (type): Description

**Returns**: Description

**Example**:
```typescript
const result = await functionName(param1, param2);
```
```

#### 3. Examples Directory
**Location**: `docs/examples/[component]/`

**When**: Adding new features

**Create**: `docs/examples/[component]/example-name.md`

**Template**:
```markdown
# [Feature Name] Example

## Use Case
Describe when to use this

## Code
```typescript
// Complete, runnable example
```

## Explanation
Step-by-step explanation
```

#### 4. ARCHITECTURE.md (If architecture changed)
**Location**: `docs/ARCHITECTURE.md`

**Update if you**:
- Added new service/class
- Changed data flow
- Modified security patterns
- Added new integration

**What to update**:
- Mermaid diagrams
- Component descriptions
- Data flow sections

#### 5. Inline Documentation (Required)
**JSDoc/TSDoc for TypeScript**:
```typescript
/**
 * Brief description
 *
 * @param wallet - Description
 * @param amount - Description
 * @returns Description
 * @throws {Error} When condition
 *
 * @example
 * ```typescript
 * const result = await myFunction(wallet, '100');
 * ```
 */
export async function myFunction(wallet: Wallet, amount: string): Promise<Result> {
  // Implementation
}
```

**Rust Doc Comments for Contracts**:
```rust
/// Brief description
///
/// # Arguments
/// * `env` - Contract environment
/// * `wallet` - Wallet address
///
/// # Returns
/// Transaction result
///
/// # Examples
/// ```
/// let result = contract.my_function(&env, wallet);
/// ```
pub fn my_function(env: &Env, wallet: Address) -> Result {
    // Implementation
}
```

---

## 🤖 AI-Friendly Contributions

### Why Documentation Matters for AI
AI assistants use our documentation to:
1. Understand patterns to follow
2. Generate consistent code
3. Solve similar problems
4. Avoid common mistakes

### Making Your Code AI-Friendly

#### 1. Clear Function Signatures
```typescript
// ✅ Good - Clear parameter names and types
async function createWallet(
  config: WalletConfig,
  password: string
): Promise<Wallet>

// ❌ Bad - Ambiguous
async function create(c: any, p: any)
```

#### 2. Comprehensive Examples
```typescript
// ✅ Good - Complete example
/**
 * @example
 * ```typescript
 * const wallet = await invisibleWalletService.createWallet({
 *   userId: 'user_123',
 *   email: 'user@example.com',
 *   network: STELLAR_TESTNET
 * }, 'securePassword123');
 *
 * console.log('Wallet created:', wallet.id);
 * console.log('Address:', wallet.publicKey);
 * ```
 */

// ❌ Bad - Incomplete
/**
 * @example
 * createWallet(config, password)
 */
```

#### 3. Document Edge Cases
```typescript
/**
 * Creates a wallet
 *
 * @throws {Error} If password is less than 8 characters
 * @throws {Error} If email format is invalid
 * @throws {Error} If network is not configured
 *
 * @remarks
 * - Password must contain uppercase, lowercase, and number
 * - Email must be unique per user
 * - Wallet creation requires network connectivity
 */
```

#### 4. Link to Related Documentation
```typescript
/**
 * Sends payment using invisible wallet
 *
 * @see {@link docs/AI.md#payment-flow} for flow diagram
 * @see {@link docs/examples/wallet/send-payment.md} for complete example
 * @see {@link InvisibleWalletService.unlockWallet} for authentication
 */
```

---

## 💻 Code Standards

### TypeScript
- Use strict mode
- Prefer `interface` over `type` for objects
- Always specify return types
- Use descriptive names
- Avoid `any` type

### Rust (Soroban)
- Follow Rust naming conventions
- Add `///` documentation for public functions
- Use `Result<T, E>` for error handling
- Test every public function

### Testing
- Unit tests: 90%+ coverage
- Integration tests for API endpoints
- E2E tests for critical flows

### Commits
```
<type>(<scope>): <description> (#issue)

feat(wallet): add multi-sig support (#6)
fix(stellar-sdk): resolve sequence number issue (#42)
docs(oracle): add price feed documentation (#33)
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## 🔀 Pull Request Process

### Before Submitting
- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] **Documentation updated** (AI.md, README, examples)
- [ ] No console.log or debug code
- [ ] Self-review completed

### PR Template Checklist
Fill out ALL sections:
1. Description
2. Related Issues
3. Testing done
4. **Documentation Updates** (required!)
5. AI-Friendly Documentation section
6. Breaking changes (if any)

### Review Process
1. Automated checks run (lint, test, build)
2. Documentation reviewer checks docs updates
3. Code reviewer reviews implementation
4. Maintainer final approval
5. Merge to main

### After Merge
- [ ] Update ROADMAP.md if closing an issue
- [ ] Close related issues
- [ ] Celebrate! 🎉

---

## 📖 Documentation Examples

### Example 1: New Feature in stellar-sdk

**Issue**: #11 Add liquidity pool operations

**Required Documentation Updates**:

1. **`docs/AI.md`** addition:
```markdown
### Liquidity Pool Operations

**Files**:
- `packages/core/stellar-sdk/src/services/liquidity-pool.service.ts`

**Usage**:
```typescript
const poolService = new LiquidityPoolService(stellarService);
await poolService.depositLiquidity(wallet, poolId, '100', '100', password);
```

**AI Notes**:
- Always check pool exists before deposit
- Calculate shares with `calculatePoolShares()`
- Use slippage tolerance for price protection
```

2. **`packages/core/stellar-sdk/README.md`** addition:
```markdown
### Liquidity Pools

#### `depositLiquidity()`
Deposit assets into a liquidity pool.

**Example**:
```typescript
const result = await liquidityPoolService.depositLiquidity(
  wallet,
  'pool_id_here',
  '100', // Amount A
  '200', // Amount B
  '0.1', // Min price
  '0.2', // Max price
  'password'
);
```
```

3. **`docs/examples/stellar-sdk/liquidity-pools.md`**:
```markdown
# Liquidity Pool Operations

## Depositing Liquidity
[Complete example with explanation]

## Withdrawing Liquidity
[Complete example with explanation]

## Common Pitfalls
- Issue 1 and solution
- Issue 2 and solution
```

---

## ❓ FAQ

### Q: How much documentation is "enough"?
**A**: If an AI assistant can implement a similar feature using only your docs, it's enough.

### Q: What if I'm just fixing a bug?
**A**: Still update:
- Inline comments explaining the fix
- AI.md with "Common Pitfalls" section
- Tests demonstrating the bug was fixed

### Q: Can I skip documentation for small changes?
**A**: No. Every change needs documentation. Small changes = small docs updates.

### Q: Where do I document breaking changes?
**A**:
1. CHANGELOG.md
2. Migration guide in relevant package README
3. AI.md with migration example

---

## 🆘 Need Help?

- Read `docs/AI.md` first
- Check existing issues for similar problems
- Ask in issue comments
- Join our Discord (if available)

---

**Remember**: Good documentation is as important as good code. Future developers (and AIs) will thank you!

## Testing Requirements

### Integration Tests
All PRs must include integration tests for new features.

### Mock Contracts
Use provided mock contracts in `test/integration/mocks/`:
- Mock Lending Protocol
- Mock DEX
- Mock Oracle

Run tests:
```bash
cd test/integration/mocks
cargo build --target wasm32-unknown-unknown --release
```

### Test Coverage
- Aim for >80% coverage on new code
- Test both success and error cases
- Clean up test data after runs