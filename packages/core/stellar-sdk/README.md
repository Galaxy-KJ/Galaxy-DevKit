# Galaxy Stellar SDK

Enhanced Stellar SDK for Galaxy DevKit with comprehensive support for Stellar operations including claimable balances and liquidity pools.

## Features

- ✅ Wallet creation and management
- ✅ Account operations (balance, info, history)
- ✅ Payments and transactions
- ✅ Trustline management
- ✅ Claimable balances
- ✅ Liquidity pool operations (AMM)
- ✅ Network switching (testnet/mainnet)
- ✅ React hooks support

## Installation

```bash
npm install @galaxy/core-stellar-sdk
```

## Quick Start

```typescript
import { StellarService, NetworkConfig, Asset } from '@galaxy/core-stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015'
};

const service = new StellarService(networkConfig);

// Create wallet
const wallet = await service.createWallet({}, password);

// Send payment
await service.sendPayment(wallet, {
  destination: 'G...',
  amount: '100.0000000',
  asset: 'XLM'
}, password);
```

## Claimable Balances Guide

Claimable balances (CAP-0023) allow you to create payments that can be claimed later by recipients, with optional time-based or conditional predicates.

### Creating Claimable Balances

#### Basic Example

```typescript
import { Asset, unconditional } from '@galaxy/core-stellar-sdk';

// Create unconditional claimable balance
const result = await service.createClaimableBalance(wallet, {
  asset: Asset.native(),
  amount: '100.0000000',
  claimants: [{
    destination: 'G...',
    predicate: unconditional()
  }]
}, password);

console.log('Balance ID:', result.balanceId);
```

#### Time-Locked Balance

```typescript
import { beforeAbsoluteTime } from '@galaxy/core-stellar-sdk';

const unlockDate = new Date('2025-12-31');

const result = await service.createClaimableBalance(wallet, {
  asset: Asset.native(),
  amount: '1000.0000000',
  claimants: [{
    destination: 'G...',
    predicate: beforeAbsoluteTime(unlockDate)
  }]
}, password);
```

#### Relative Time Lock

```typescript
import { beforeRelativeTime } from '@galaxy/core-stellar-sdk';

// Must claim within 24 hours (86400 seconds)
const result = await service.createClaimableBalance(wallet, {
  asset: Asset.native(),
  amount: '500.0000000',
  claimants: [{
    destination: 'G...',
    predicate: beforeRelativeTime(86400)
  }]
}, password);
```

#### Multi-Claimant Balance

```typescript
// Multiple parties can claim (first to claim wins)
const result = await service.createClaimableBalance(wallet, {
  asset: Asset.native(),
  amount: '1000.0000000',
  claimants: [
    {
      destination: 'G...', // User 1
      predicate: unconditional()
    },
    {
      destination: 'G...', // User 2
      predicate: unconditional()
    },
    {
      destination: wallet.publicKey, // Self (for cleanup)
      predicate: unconditional()
    }
  ]
}, password);
```

### Claiming Balances

```typescript
// Claim a balance
const claimResult = await service.claimBalance(claimantWallet, {
  balanceId: '00000000...'
}, password);

console.log('Claimed:', claimResult.hash);
```

### Querying Claimable Balances

```typescript
// Get all claimable balances for an account
const balances = await service.getClaimableBalancesForAccount(
  publicKey,
  10 // limit
);

// Get balances by asset
const xlmBalances = await service.getClaimableBalancesByAsset(
  Asset.native(),
  10
);

// Get specific balance details
const balance = await service.getClaimableBalance(balanceId);

console.log('Balance:', balance.amount, balance.asset);
console.log('Claimants:', balance.claimants);
```

## Predicate Examples

### Unconditional

```typescript
import { unconditional } from '@galaxy/core-stellar-sdk';

const predicate = unconditional(); // Can claim anytime
```

### Time-Based Predicates

```typescript
import { beforeAbsoluteTime, beforeRelativeTime } from '@galaxy/core-stellar-sdk';

// Absolute time (before specific date)
const predicate1 = beforeAbsoluteTime(new Date('2025-12-31'));

// Relative time (within X seconds)
const predicate2 = beforeRelativeTime(86400); // 24 hours
```

### Complex Predicates

```typescript
import { and, or, not } from '@galaxy/core-stellar-sdk';

// AND: Both conditions must be true
const andPredicate = and(
  beforeAbsoluteTime(new Date('2025-12-31')),
  unconditional() // This will always be true, so effectively just time-locked
);

// OR: Either condition must be true
const orPredicate = or(
  beforeAbsoluteTime(new Date('2025-01-01')),
  beforeAbsoluteTime(new Date('2025-12-31'))
);

// NOT: Negation
const notPredicate = not(beforeAbsoluteTime(new Date('2025-01-01')));
```

## Use Case Implementations

### Vesting Schedule

```typescript
import { createVestingSchedule, Asset } from '@galaxy/core-stellar-sdk';

const sourceAccount = await server.loadAccount(wallet.publicKey);

const operations = createVestingSchedule(sourceAccount, {
  asset: Asset.native(),
  totalAmount: '10000.0000000',
  claimant: 'G...',
  vestingPeriods: [
    { date: new Date('2025-01-01'), percentage: 25 },
    { date: new Date('2025-04-01'), percentage: 25 },
    { date: new Date('2025-07-01'), percentage: 25 },
    { date: new Date('2025-10-01'), percentage: 25 }
  ]
});

// Add operations to transaction
const tx = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: networkConfig.passphrase
});

operations.forEach(op => tx.addOperation(op));
const transaction = tx.build();
```

### Escrow

```typescript
import { createEscrow, Asset } from '@galaxy/core-stellar-sdk';

const operation = createEscrow({
  asset: Asset.native(),
  amount: '5000.0000000',
  parties: ['G...', 'G...'], // Buyer and seller
  releaseDate: new Date('2025-06-01'),
  arbitrator: 'G...' // Optional arbitrator
});
```

### Two-Party Escrow with Arbitrator

```typescript
import { createTwoPartyEscrow, Asset } from '@galaxy/core-stellar-sdk';

const operation = createTwoPartyEscrow({
  asset: Asset.native(),
  amount: '10000.0000000',
  buyer: 'G...',
  seller: 'G...',
  arbitrator: 'G...',
  releaseDate: new Date('2025-06-01')
});
```

### Refundable Balance

```typescript
import { createRefundableBalance, Asset } from '@galaxy/core-stellar-sdk';

const operation = createRefundableBalance({
  asset: Asset.native(),
  amount: '1000.0000000',
  recipient: 'G...',
  sender: wallet.publicKey,
  expirationDate: new Date('2025-12-31')
});
// Recipient can claim before expiration
// Sender can reclaim after expiration
```

## Liquidity Pool Operations

Liquidity pools enable automated market making (AMM) on Stellar using the constant product formula (x * y = k). Provide liquidity to pools and earn fees from trades.

### Finding Pools

```typescript
import { Asset } from '@galaxy/core-stellar-sdk';

// Find pools for asset pair
const xlm = Asset.native();
const usdc = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');

const pools = await service.getPoolsForAssets(xlm, usdc, 5);
console.log('Found', pools.length, 'pools');

// Get specific pool details
const pool = await service.getLiquidityPool(poolId);
console.log('Reserve A:', pool.reserveA);
console.log('Reserve B:', pool.reserveB);
console.log('Total Shares:', pool.totalShares);
```

### Depositing Liquidity

```typescript
// Estimate deposit first
const estimate = await service.estimatePoolDeposit(
  poolId,
  '100.0000000', // Amount of asset A
  '500.0000000'  // Amount of asset B
);

console.log('Expected shares:', estimate.shares);
console.log('Price impact:', estimate.priceImpact, '%');
console.log('Pool share:', estimate.poolShare, '%');

// Deposit with slippage protection
const depositResult = await service.depositLiquidity(wallet, {
  poolId: poolId,
  maxAmountA: '100.0000000',
  maxAmountB: '500.0000000',
  slippageTolerance: '0.01', // 1% slippage tolerance
  memo: 'LP deposit'
}, password);

console.log('Transaction Hash:', depositResult.hash);
```

### Withdrawing Liquidity

```typescript
// Get your shares
const userShares = await service.getLiquidityPoolShares(wallet.publicKey, poolId);
console.log('Your shares:', userShares);

// Estimate withdrawal
const withdrawEstimate = await service.estimatePoolWithdraw(
  poolId,
  '10.0000000' // Shares to withdraw
);

console.log('Expected Asset A:', withdrawEstimate.amountA);
console.log('Expected Asset B:', withdrawEstimate.amountB);

// Withdraw with slippage protection
const withdrawResult = await service.withdrawLiquidity(wallet, {
  poolId: poolId,
  shares: '10.0000000',
  slippageTolerance: '0.01',
  memo: 'LP withdrawal'
}, password);
```

### Pool Analytics

```typescript
import {
  calculateShareValue,
  calculateImpermanentLoss,
  formatPoolAssets,
  calculateSpotPrice
} from '@galaxy/core-stellar-sdk';

// Get pool analytics
const analytics = await service.getPoolAnalytics(poolId);
console.log('TVL:', analytics.tvl);
console.log('Share Price:', analytics.sharePrice);

// Calculate your position value
const { valueA, valueB } = calculateShareValue(userShares, pool);
console.log('Your position - Asset A:', valueA);
console.log('Your position - Asset B:', valueB);

// Calculate impermanent loss
const initialPrice = '5.0000000'; // Price when you entered
const currentPrice = calculateSpotPrice(pool.reserveA, pool.reserveB);
const il = calculateImpermanentLoss(initialPrice, currentPrice);
console.log('Impermanent Loss:', il, '%');

// Format pool name
const poolName = formatPoolAssets(pool);
console.log('Pool:', poolName); // e.g., "XLM/USDC"
```

### Slippage Protection

```typescript
import { calculateMinimumAmounts, calculatePriceBounds } from '@galaxy/core-stellar-sdk';

// Calculate minimum amounts with slippage tolerance
const { minAmountA, minAmountB } = calculateMinimumAmounts(
  '100.0000000',
  '500.0000000',
  '0.01' // 1% slippage
);

// Calculate price bounds
const currentPrice = calculateSpotPrice(pool.reserveA, pool.reserveB);
const { minPrice, maxPrice } = calculatePriceBounds(currentPrice, '0.02'); // 2% tolerance

// Deposit with price bounds
await service.depositLiquidity(wallet, {
  poolId: poolId,
  maxAmountA: '100.0000000',
  maxAmountB: '500.0000000',
  minPrice: minPrice,
  maxPrice: maxPrice,
  memo: 'Price protected deposit'
}, password);
```

### Price Calculation Examples

```typescript
// Constant product formula: x * y = k
const k = new BigNumber(pool.reserveA).multipliedBy(pool.reserveB);

// Spot price: P = reserveB / reserveA
const spotPrice = new BigNumber(pool.reserveB).dividedBy(pool.reserveA);

// First deposit shares: sqrt(amountA * amountB)
const shares = Math.sqrt(amountA * amountB);

// Subsequent deposit shares: min(amountA/reserveA, amountB/reserveB) * totalShares
const ratioA = amountA / pool.reserveA;
const ratioB = amountB / pool.reserveB;
const ratio = Math.min(ratioA, ratioB);
const depositShares = ratio * pool.totalShares;

// Withdrawal amounts: (shares / totalShares) * reserves
const withdrawAmountA = (shares / pool.totalShares) * pool.reserveA;
const withdrawAmountB = (shares / pool.totalShares) * pool.reserveB;
```

### Important Notes

- **Pool IDs**: 64-character hex strings generated by Stellar network
- **Precision**: All amounts use 7 decimal places
- **Slippage**: Default 1%, warn if price impact > 5%
- **Estimation**: Always estimate before executing operations
- **First Deposit**: Uses geometric mean (sqrt) for share calculation
- **Subsequent**: Uses proportional ratio to maintain pool balance

## React Hook Usage

```typescript
import { useStellar } from '@galaxy/core-stellar-sdk';

function MyComponent() {
  const {
    wallet,
    createWallet,
    createClaimableBalance,
    claimBalance,
    getClaimableBalances
  } = useStellar(networkConfig);

  const handleCreateBalance = async () => {
    if (!wallet) return;
    
    const result = await createClaimableBalance({
      asset: Asset.native(),
      amount: '100.0000000',
      claimants: [{
        destination: 'G...',
        predicate: unconditional()
      }]
    }, password);
    
    console.log('Created:', result.balanceId);
  };

  return (
    <button onClick={handleCreateBalance}>
      Create Claimable Balance
    </button>
  );
}
```

## API Reference

### StellarService Methods

#### Claimable Balance Methods

- `createClaimableBalance(wallet, params, password)` - Create a claimable balance
- `claimBalance(wallet, params, password)` - Claim a balance
- `getClaimableBalance(balanceId)` - Get balance details
- `getClaimableBalances(params)` - Query balances with filters
- `getClaimableBalancesForAccount(publicKey, limit)` - Get balances for account
- `getClaimableBalancesByAsset(asset, limit)` - Get balances by asset

#### Standard Methods

- `createWallet(config, password)` - Create new wallet
- `createWalletFromMnemonic(mnemonic, password, config)` - Create from mnemonic
- `sendPayment(wallet, params, password)` - Send payment
- `getAccountInfo(publicKey)` - Get account information
- `getBalance(publicKey, asset)` - Get balance for asset
- `addTrustline(wallet, assetCode, assetIssuer, limit, password)` - Add trustline

### Predicate Builders

- `unconditional()` - Unconditional predicate
- `beforeAbsoluteTime(timestamp)` - Before absolute timestamp
- `beforeRelativeTime(seconds)` - Before relative time
- `and(predicate1, predicate2)` - AND operator
- `or(predicate1, predicate2)` - OR operator
- `not(predicate)` - NOT operator

### Helper Functions

- `createTimeLockedBalance(params)` - Time-locked balance operation
- `createVestingSchedule(sourceAccount, params)` - Vesting schedule operations
- `createEscrow(params)` - Escrow operation
- `createTwoPartyEscrow(params)` - Two-party escrow
- `createRefundableBalance(params)` - Refundable balance

## Important Notes

### Trustlines

For non-native assets, claimants must establish a trustline before claiming, otherwise the claim will fail with `op_no_trust` error.

### Minimum Balance

Each claimant increases the source account's minimum balance by one base reserve (0.5 XLM).

### Unclaimed Balances

Unclaimed balances persist on the ledger indefinitely. Best practice: include your own account as a claimant for cleanup flexibility.

### Balance ID

The balance ID is generated as SHA-256 hash of the operation ID. It's returned in the `createClaimableBalance` result.

## Examples

See `docs/examples/stellar-sdk/` for complete examples:
- `11-claimable-balance.ts` - Basic create and claim
- `12-time-locked-payment.ts` - Time-locked payments
- `13-escrow.ts` - Escrow implementation
- `14-vesting.ts` - Token vesting schedules

## License

MIT
