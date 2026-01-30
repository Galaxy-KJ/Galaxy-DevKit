# Blend Protocol Integration

Complete implementation of [Blend Protocol](https://blend.capital/) lending and borrowing functionality on Stellar.

## Features

### Issue #21: Blend Protocol Service ✅
- Core BlendProtocol class implementation
- Soroban contract integration
- Pool configuration management
- Protocol initialization and validation

### Issue #22: Supply/Withdraw Operations ✅
- `supply()` - Deposit assets into Blend lending pools
- `withdraw()` - Withdraw supplied assets from pools
- Interest accrual tracking
- Collateral management

### Issue #23: Borrow/Repay Operations ✅
- `borrow()` - Take loans against collateral
- `repay()` - Repay borrowed amounts
- Interest calculation
- Collateral validation

### Issue #24: Position Management & Health Factor ✅
- `getPosition()` - Retrieve user's lending/borrowing position
- `getHealthFactor()` - Calculate position health and liquidation risk
- Collateral and debt value tracking
- Real-time position monitoring

### Issue #25: Liquidation Functionality ✅
- `liquidate()` - Liquidate unhealthy positions
- `findLiquidationOpportunities()` - Discover liquidatable positions
- Liquidation profit calculation
- Automated liquidation support

## Installation

```bash
npm install @galaxy-devkit/defi-protocols
```

## CLI Commands

Galaxy CLI provides easy-to-use commands for interacting with Blend Protocol. All commands support both testnet (default) and mainnet.

### Prerequisites

1. Install Galaxy CLI globally or use from project root
2. Create a wallet: `galaxy wallet create`
3. Fund your wallet with testnet tokens from [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)

### Available Commands

```bash
galaxy blend <command> [options]
```

#### View All Commands

```bash
galaxy blend --help
```

### 1. Supply Assets

Deposit assets into Blend lending pools to earn interest.

```bash
# Interactive mode (prompts for wallet and amount)
galaxy blend supply

# With flags
galaxy blend supply --wallet dev --asset XLM --amount 100

# Supply USDC to testnet
galaxy blend supply --wallet dev --asset USDC --amount 500

# Supply to mainnet
galaxy blend supply --wallet prod --asset XLM --amount 1000 --mainnet

# JSON output
galaxy blend supply --wallet dev --asset XLM --amount 100 --json
```

**Options:**
- `-w, --wallet <name>` - Wallet name to use
- `-a, --asset <code>` - Asset code (XLM, USDC, BLND, wBTC, wETH)
- `-i, --issuer <address>` - Asset issuer (not needed for XLM)
- `--amount <amount>` - Amount to supply
- `--mainnet` - Use mainnet (default: testnet)
- `--json` - Output as JSON

### 2. Withdraw Assets

Withdraw your supplied assets from Blend pools.

```bash
# Interactive mode
galaxy blend withdraw

# Withdraw XLM from testnet
galaxy blend withdraw --wallet dev --asset XLM --amount 50

# Withdraw USDC from mainnet
galaxy blend withdraw --wallet prod --asset USDC --amount 200 --mainnet
```

**Options:** Same as supply command

### 3. Borrow Assets

Borrow assets against your supplied collateral.

```bash
# Interactive mode
galaxy blend borrow

# Borrow XLM
galaxy blend borrow --wallet dev --asset XLM --amount 25

# Borrow USDC
galaxy blend borrow --wallet dev --asset USDC --amount 100

# Borrow from mainnet
galaxy blend borrow --wallet prod --asset XLM --amount 50 --mainnet
```

**Options:** Same as supply command

**Warning:** Monitor your health factor after borrowing!

### 4. Repay Borrowed Assets

Repay your borrowed amounts to improve health factor.

```bash
# Interactive mode
galaxy blend repay

# Repay XLM loan
galaxy blend repay --wallet dev --asset XLM --amount 25

# Repay USDC loan
galaxy blend repay --wallet dev --asset USDC --amount 50

# Repay on mainnet
galaxy blend repay --wallet prod --asset XLM --amount 10 --mainnet
```

**Options:** Same as supply command

### 5. View Your Position

Check your current lending and borrowing position.

```bash
# View position for your wallet
galaxy blend position --wallet dev

# View position for specific address
galaxy blend position --address GBORROWER...

# View on mainnet
galaxy blend position --wallet prod --mainnet

# JSON output
galaxy blend position --wallet dev --json
```

**Options:**
- `-w, --wallet <name>` - Wallet name
- `-a, --address <address>` - Address to check (optional)
- `--mainnet` - Use mainnet
- `--json` - Output as JSON

**Output:**
```
📊 Blend Protocol Position
════════════════════════════════════════════════════════════════
Address: GUSER...

💰 Supplied Assets:
┌────────┬──────────┬──────────────┐
│ Asset  │ Amount   │ Value (USD)  │
├────────┼──────────┼──────────────┤
│ XLM    │ 100.00   │ $40.00       │
│ USDC   │ 500.00   │ $500.00      │
└────────┴──────────┴──────────────┘

🏦 Borrowed Assets:
┌────────┬──────────┬──────────────┐
│ Asset  │ Amount   │ Value (USD)  │
├────────┼──────────┼──────────────┤
│ XLM    │ 25.00    │ $10.00       │
└────────┴──────────┴──────────────┘

📈 Summary:
────────────────────────────────────────────────────────────────
  Total Collateral: $540.00
  Total Debt:       $10.00
  Health Factor:    54.0
════════════════════════════════════════════════════════════════
```

### 6. Check Health Factor

Monitor your position's health to avoid liquidation.

```bash
# Check health for your wallet
galaxy blend health --wallet dev

# Check health for specific address
galaxy blend health --address GBORROWER...

# Check on mainnet
galaxy blend health --wallet prod --mainnet
```

**Options:** Same as position command

**Output:**
```
🏥 Health Factor
════════════════════════════════════════════════════════════
  Address: GUSER...
────────────────────────────────────────────────────────────
  Health Factor:        2.5
  Liquidation Threshold: 0.85
  Max LTV:              0.75
  Status:               ✅ Healthy
════════════════════════════════════════════════════════════

  ✅ Your position is healthy!
```

**Health Factor Guide:**
- **> 1.5** - Healthy (green) ✅
- **1.2 - 1.5** - Caution (yellow) ⚠️
- **< 1.2** - At risk (red) 🔴
- **< 1.0** - Subject to liquidation ⚠️

### 7. Liquidate Unhealthy Positions

Liquidate positions with health factor < 1.0 for profit.

```bash
# Liquidate a position
galaxy blend liquidate \
  --wallet liquidator \
  --target GBORROWER... \
  --debt-asset XLM \
  --debt-amount 10 \
  --collateral-asset USDC

# Liquidate on mainnet
galaxy blend liquidate \
  --wallet liquidator-prod \
  --target GBORROWER... \
  --debt-asset USDC \
  --debt-amount 50 \
  --collateral-asset wBTC \
  --mainnet

# Skip confirmation
galaxy blend liquidate \
  --wallet liquidator \
  --target GBORROWER... \
  --debt-asset XLM \
  --debt-amount 10 \
  --collateral-asset USDC \
  --yes
```

**Options:**
- `-w, --wallet <name>` - Your liquidator wallet
- `-t, --target <address>` - Address to liquidate
- `--debt-asset <code>` - Debt asset to repay
- `--debt-amount <amount>` - Amount of debt to repay
- `--collateral-asset <code>` - Collateral asset to receive
- `--mainnet` - Use mainnet
- `--yes` - Skip confirmation prompt
- `--json` - Output as JSON

### 8. View Protocol Statistics

Check overall Blend protocol metrics.

```bash
# View stats on testnet
galaxy blend stats

# View stats on mainnet
galaxy blend stats --mainnet

# JSON output
galaxy blend stats --json
```

**Output:**
```
📊 Blend Protocol Statistics
════════════════════════════════════════════════════════════
  Total Supply:      $15,234,567.00
  Total Borrow:      $8,456,234.00
  TVL:               $15,234,567.00
  Utilization Rate:  55.48%
  Last Updated:      2026-01-29 10:30:00
════════════════════════════════════════════════════════════
```

### Supported Assets

#### Testnet
- **XLM** - Native Stellar Lumens (7 decimals)
- **BLND** - Blend Protocol Token (7 decimals)
- **USDC** - USD Coin (6 decimals)
- **wETH** - Wrapped Ethereum (18 decimals)
- **wBTC** - Wrapped Bitcoin (8 decimals)

#### Mainnet
Coming soon - addresses will be updated when Blend launches on mainnet.

### Common Workflows

#### First Time User - Supply and Borrow

```bash
# 1. Create wallet
galaxy wallet create

# 2. Fund wallet with testnet tokens
# Visit https://laboratory.stellar.org/#account-creator?network=test

# 3. Supply collateral
galaxy blend supply --wallet dev --asset XLM --amount 100

# 4. Check position
galaxy blend position --wallet dev

# 5. Borrow against collateral
galaxy blend borrow --wallet dev --asset USDC --amount 30

# 6. Monitor health factor
galaxy blend health --wallet dev
```

#### Managing Your Position

```bash
# Check current position
galaxy blend position --wallet dev

# Add more collateral if needed
galaxy blend supply --wallet dev --asset XLM --amount 50

# Repay some debt to improve health
galaxy blend repay --wallet dev --asset USDC --amount 10

# Verify improved health
galaxy blend health --wallet dev
```

#### Liquidation Bot

```bash
# Create liquidator wallet
galaxy wallet create --name liquidator

# Fund with assets for liquidation

# Monitor for opportunities (in a script/bot)
while true; do
  galaxy blend liquidate \
    --wallet liquidator \
    --target <found-address> \
    --debt-asset XLM \
    --debt-amount <calculated> \
    --collateral-asset USDC \
    --yes
  sleep 60
done
```

### Network Configuration

The CLI automatically uses the correct network configuration:

**Testnet (default):**
- Horizon: `https://horizon-testnet.stellar.org`
- Soroban RPC: `https://soroban-testnet.stellar.org`
- Pool Contract: `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF`

**Mainnet (with --mainnet flag):**
- Horizon: `https://horizon.stellar.org`
- Soroban RPC: `https://soroban-rpc.stellar.org`
- Pool Contract: TBD (will be updated when Blend launches)

### Decimal Handling

The CLI automatically converts amounts to the correct decimal precision for each asset:
- XLM: 7 decimals (10,000,000 stroops = 1 XLM)
- BLND: 7 decimals
- USDC: 6 decimals (1,000,000 = 1 USDC)
- wETH: 18 decimals
- wBTC: 8 decimals

You always input human-readable amounts (e.g., "100") and the CLI handles the conversion.

### Error Messages

Common errors and solutions:

```bash
# Wallet not found
# Solution: Create wallet with `galaxy wallet create`

# Insufficient balance
# Solution: Fund wallet with testnet tokens

# Health factor too low for borrowing
# Solution: Supply more collateral or borrow less

# Position is healthy (cannot liquidate)
# Solution: Only positions with health < 1.0 can be liquidated

# Network error
# Solution: Check internet connection and Stellar network status
```

## SDK Usage

For programmatic access, use the SDK directly:

### Basic Setup

```typescript
import { BlendProtocol, registerBlendProtocol } from '@galaxy-devkit/defi-protocols';

// Register Blend with the protocol factory (auto-registered on import)
registerBlendProtocol();

// Create Blend instance
const blend = new BlendProtocol({
  protocolId: 'blend',
  name: 'Blend Protocol',
  network: {
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015'
  },
  contractAddresses: {
    pool: 'POOL_CONTRACT_ADDRESS',
    oracle: 'ORACLE_CONTRACT_ADDRESS'
  },
  metadata: {}
});

// Initialize the protocol
await blend.initialize();
```

### Supply Assets

```typescript
const result = await blend.supply(
  'GUSER_ADDRESS',
  'SUSER_SECRET_KEY',
  {
    code: 'USDC',
    issuer: 'GUSDC_ISSUER',
    type: 'credit_alphanum4'
  },
  '1000' // Amount to supply
);

console.log(`Supply transaction: ${result.hash}`);
```

### Withdraw Assets

```typescript
const result = await blend.withdraw(
  'GUSER_ADDRESS',
  'SUSER_SECRET_KEY',
  {
    code: 'USDC',
    issuer: 'GUSDC_ISSUER',
    type: 'credit_alphanum4'
  },
  '500' // Amount to withdraw
);
```

### Borrow Assets

```typescript
const result = await blend.borrow(
  'GUSER_ADDRESS',
  'SUSER_SECRET_KEY',
  {
    code: 'XLM',
    type: 'native'
  },
  '100' // Amount to borrow
);
```

### Repay Loan

```typescript
const result = await blend.repay(
  'GUSER_ADDRESS',
  'SUSER_SECRET_KEY',
  {
    code: 'XLM',
    type: 'native'
  },
  '50' // Amount to repay
);
```

### Check Position

```typescript
const position = await blend.getPosition('GUSER_ADDRESS');

console.log('Supplied assets:', position.supplied);
console.log('Borrowed assets:', position.borrowed);
console.log('Total collateral value:', position.collateralValue);
console.log('Total debt value:', position.debtValue);
```

### Monitor Health Factor

```typescript
const health = await blend.getHealthFactor('GUSER_ADDRESS');

console.log('Health Factor:', health.value);
console.log('Is Healthy:', health.isHealthy);
console.log('Liquidation Threshold:', health.liquidationThreshold);

if (!health.isHealthy) {
  console.warn('⚠️ Position is at risk of liquidation!');
}
```

### Liquidate Position

```typescript
// Find liquidation opportunities
const opportunities = await blend.findLiquidationOpportunities(1.0);

// Liquidate an unhealthy position
const liquidationResult = await blend.liquidate(
  'GLIQUIDATOR_ADDRESS',
  'SLIQUIDATOR_SECRET_KEY',
  'GBORROWER_ADDRESS', // Address to liquidate
  {
    code: 'USDC',
    issuer: 'GUSDC_ISSUER',
    type: 'credit_alphanum4'
  }, // Debt asset to repay
  '100', // Amount of debt to repay
  {
    code: 'XLM',
    type: 'native'
  } // Collateral asset to receive
);

console.log('Liquidation profit:', liquidationResult.profitUSD);
```

### Get Protocol Stats

```typescript
const stats = await blend.getStats();

console.log('Total Supply:', stats.totalSupply);
console.log('Total Borrow:', stats.totalBorrow);
console.log('TVL:', stats.tvl);
console.log('Utilization Rate:', stats.utilizationRate);
```

### Check APY Rates

```typescript
const usdc = {
  code: 'USDC',
  issuer: 'GUSDC_ISSUER',
  type: 'credit_alphanum4'
};

const supplyAPY = await blend.getSupplyAPY(usdc);
const borrowAPY = await blend.getBorrowAPY(usdc);

console.log(`USDC Supply APY: ${supplyAPY.supplyAPY}%`);
console.log(`USDC Borrow APY: ${borrowAPY.borrowAPY}%`);
```

## Architecture

### Class Hierarchy

```
IDefiProtocol (interface)
    ↓
BaseProtocol (abstract class)
    ↓
BlendProtocol (concrete implementation)
```

### Key Components

1. **BlendProtocol** - Main protocol implementation
2. **BlendTypes** - Type definitions for Blend-specific data structures
3. **BlendRegistration** - Factory registration for dependency injection

### Contract Interaction

The implementation uses Soroban RPC to interact with Blend smart contracts:

1. Build transaction with contract invocation
2. Simulate transaction to estimate fees
3. Assemble transaction with simulation results
4. Sign and submit to network
5. Wait for confirmation

## Error Handling

All methods throw descriptive errors:

```typescript
try {
  await blend.borrow(address, privateKey, asset, amount);
} catch (error) {
  if (error.message.includes('not initialized')) {
    // Protocol not initialized
  } else if (error.message.includes('Simulation failed')) {
    // Transaction would fail on-chain
  } else {
    // Other errors
  }
}
```

## Testing

Run tests with:

```bash
npm test -- blend-protocol.test.ts
```

## Types

All TypeScript types are fully documented:

```typescript
import type {
  BlendPosition,
  BlendReserveData,
  LiquidationOpportunity,
  LiquidationResult
} from '@galaxy-devkit/defi-protocols';
```

## Roadmap Completion

- ✅ **#21** - Blend protocol service implementation
- ✅ **#22** - Supply/withdraw operations
- ✅ **#23** - Borrow/repay operations
- ✅ **#24** - Position management and health factor
- ✅ **#25** - Liquidation functionality

## Contributing

See [CONTRIBUTING.md](../../../../../CONTRIBUTING.md) for guidelines.

## License

MIT
