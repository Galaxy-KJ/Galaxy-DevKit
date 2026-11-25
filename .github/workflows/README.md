# 🚀 GitHub Actions Workflows

This directory contains automated workflows for continuous integration, security, and quality assurance.

## 📋 Available Workflows

### 1. **Quick Check** ⚡ (`quick-check.yml`)

**Trigger**: Every PR commit
**Duration**: ~3-5 minutes
**Purpose**: Fast feedback for developers

**What it does:**
- ✅ Type checking (TypeScript)
- ✅ Lint checking (ESLint)
- ✅ Validates package.json files
- ⚠️ Warns about console.log statements

**Why it's fast:**
- Shallow clone (fetch-depth: 1)
- Skips tests (run in full CI)
- Uses npm cache
- Parallel execution where possible

---

### 2. **CI - Build, Test & Lint** 🔨 (`ci.yml`)

**Trigger**: Push to main/develop, PRs
**Duration**: ~10-15 minutes
**Purpose**: Comprehensive validation

**Jobs:**

#### Quality Checks (5 min)
- Type checking with TypeScript
- Lint checking with ESLint

#### Build (5 min)
- Builds all packages
- Caches artifacts for test job

#### Tests (10 min)
- Runs test suite with coverage
- Matrix strategy for multiple packages
- Uploads coverage to Codecov
- **Fails if coverage < 90%**

#### Security Audit (3 min)
- Runs npm audit
- **Fails on high/critical vulnerabilities**
- Allows low/moderate (with warning)

**Optimizations:**
- Parallel job execution
- Build artifact caching
- Cancel in-progress runs for same PR
- Matrix strategy for package testing

---

### 3. **Security Audit** 🔒 (`security.yml`)

**Trigger**:
- Daily at 2 AM UTC
- Push to main (package changes)
- Manual dispatch

**Duration**: ~5-10 minutes
**Purpose**: Proactive security monitoring

**What it does:**
- Runs comprehensive npm audit
- Parses and categorizes vulnerabilities
- **Fails on critical/high vulnerabilities**
- Creates GitHub issue for moderate vulnerabilities
- Dependency review on PRs

**Features:**
- Automated issue creation
- Detailed severity breakdown
- Prevents duplicate issues
- Blocks malicious licenses (GPL-3.0, AGPL-3.0)

---

### 4. **PR Validation** ✅ (`pr-validation.yml`)

**Trigger**: PR opened/updated
**Duration**: ~5-10 minutes
**Purpose**: PR quality and completeness

**Checks:**

#### Metadata Validation
- PR title format (feat:, fix:, docs:, etc.)
- PR description length and content
- Issue references (#123)

#### Changed Files Analysis
- Detects code vs doc changes
- Warns if code changed without docs
- Warns if code changed without tests

#### Size Check
- Analyzes bundle sizes
- Reports package sizes in summary

**Output**: Comprehensive validation summary

---

### 5. **Dependency Updates** 📦 (`dependency-update.yml`)

**Trigger**:
- Weekly on Mondays at 9 AM UTC
- Manual dispatch

**Duration**: ~5-10 minutes
**Purpose**: Track outdated dependencies

**What it does:**
- Checks all outdated packages
- Highlights Stellar SDK updates
- Creates/updates tracking issue
- Provides update commands

**Features:**
- Automated issue management
- Prioritizes critical dependencies
- Includes update instructions
- Weekly monitoring

---

### 6. **Contracts - Soroban** 🦀 (`contracts.yml`)

**Trigger**:
- PRs to main/develop that change `packages/contracts/**` or this workflow
- Every push to main
- Manual dispatch

**Duration**: ~3-5 minutes with a warm cache
**Purpose**: Keep every Soroban contract compiling, lint-clean and tested

**What it does:**
- `cargo fmt --all --check`
- `cargo clippy --workspace --all-targets --locked -- -D warnings`
- `cargo test --workspace --locked`
- `stellar contract build` (wasm32v1-none) for every contract
- Writes each contract's wasm size to the job summary and uploads the wasm as an artifact

**Notes:**
- All contracts are members of the Cargo workspace at `packages/contracts/Cargo.toml`, with a committed `Cargo.lock`. Add new contracts to its `members` list.
- The Rust version is pinned in `packages/contracts/rust-toolchain.toml`.
- Swatinem/rust-cache caches `~/.cargo` and `target/`; only main saves the cache.
- Because of the paths filter, don't mark this job as a required check: PRs that skip it would wait for it forever.

---

## 🎯 Workflow Strategy

### Fast Feedback Loop
```
Quick Check (3-5 min) → Fast feedback
     ↓ (if passes)
Full CI (10-15 min) → Comprehensive validation
     ↓ (if passes)
Merge → Production ready
```

### Security First
```
PR → Security audit on dependencies
Daily → Proactive vulnerability scan
Weekly → Outdated packages check
```

## 📊 Performance Optimizations

### 1. **Caching**
- ✅ npm dependencies cached
- ✅ Build artifacts cached
- ✅ TypeScript build cache

### 2. **Parallel Execution**
- ✅ Independent jobs run in parallel
- ✅ Matrix strategy for package tests
- ✅ Concurrent linting and type-checking

### 3. **Smart Cancellation**
- ✅ Cancel outdated runs for same PR
- ✅ Separate concurrency groups

### 4. **Shallow Clones**
- ✅ Quick check uses depth=1
- ✅ Full CI uses depth=0 for better caching

### 5. **Job Dependencies**
- ✅ Tests wait for successful build
- ✅ Skip unnecessary jobs based on file changes

## 🛠️ Local Development

### Run checks locally before pushing:

```bash
# Quick validation
npm run type-check
npm run lint

# Full test suite
npm test

# Coverage check
npm run test:coverage

# Security audit
npm audit --audit-level=moderate

# Check outdated packages
npm outdated
```

## 🔧 Workflow Configuration

### Required Secrets
None! All workflows use GitHub's default token.

### Optional Secrets
- `CODECOV_TOKEN`: For Codecov integration (optional, public repos work without it)

## 📈 Success Criteria

### PR Merging Requirements
- ✅ Quick check passed
- ✅ All CI jobs passed
- ✅ No high/critical vulnerabilities
- ✅ Test coverage ≥ 90%
- ✅ No TypeScript errors
- ✅ No linting errors

### Daily/Weekly Monitoring
- 🔒 Security audit passing
- 📦 Dependencies tracked
- 📊 Coverage maintained

## 🚨 Troubleshooting

### Workflow fails on fork PRs?
- Fork PRs have limited permissions
- Some actions (like creating issues) won't work
- Core validations still run

### Cache issues?
```bash
# Clear GitHub Actions cache
gh cache delete --all
```

### Failed dependency review?
- Check for new high-severity vulnerabilities
- Review package-lock.json changes
- Run `npm audit` locally

## 📝 Adding New Workflows

1. Create `.github/workflows/your-workflow.yml`
2. Add to this README
3. Test with `act` locally (optional)
4. Create PR with workflow changes

## 🔗 Resources

- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Workflow Syntax](https://docs.github.com/actions/reference/workflow-syntax-for-github-actions)
- [Action Marketplace](https://github.com/marketplace?type=actions)

---

**Last Updated**: 2026-01-15
**Maintained By**: Galaxy DevKit Team
