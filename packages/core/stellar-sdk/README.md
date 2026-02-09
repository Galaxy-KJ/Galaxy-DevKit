# @galaxy/core/stellar-sdk


Enhanced Stellar SDK for Galaxy DevKit with comprehensive support for Stellar operations including claimable balances and liquidity pools.

## Features

- ✅ Wallet creation and management
- ✅ Account operations (balance, info, history)
- ✅ Payments and transactions
- ✅ Trustline management
- ✅ Claimable balances
- ✅ Liquidity pool operations (AMM)
- ✅ **Path payments** (path finding, swap execution, slippage protection)
- ✅ Network switching (testnet/mainnet)
- ✅ React hooks support


A comprehensive TypeScript SDK for Stellar blockchain operations, providing high-level abstractions over the Stellar SDK for common operations including account management, payments, assets, and sponsored reserves.


## Installation

```bash
npm install @galaxy/core/stellar-sdk
```

## Features

- **Account Management**: Create, fund, and manage Stellar accounts
- **Payments**: Send XLM and custom assets with ease
- **Asset Operations**: Create trustlines, issue assets, manage balances
- **Transaction Building**: Simplified transaction construction and submission
- **Sponsored Reserves**: Enable users to hold assets without XLM reserves
- **Network Support**: Testnet and Mainnet configuration

## Quick Start

```typescript
import { StellarService, NetworkConfig } from '@galaxy/core/stellar-sdk';

// Configure for testnet
const config: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

// Initialize the service
const stellar = new StellarService(config);

// Create a new account
const keypair = Keypair.random();
await stellar.createAccount(keypair.publicKey(), '100');
```

## Sponsored Reserves

The sponsored reserves module enables sponsor accounts to pay base reserves for another account's ledger entries. This is essential for user onboarding without requiring new users to hold XLM.

### Key Concepts

- **Sponsor**: Account that pays the reserve requirements
- **Sponsored**: Account that benefits from the sponsorship
- **Base Reserve**: Currently 0.5 XLM per ledger entry
- **Supported Entries**: Accounts, trustlines, offers, data entries, claimable balances, signers

### Basic Usage

#### Create a Sponsored Account

```typescript
import {
  SponsoredAccountBuilder,
  calculateEntryReserve,
} from '@galaxy/core/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

const networkConfig = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const sponsorKeypair = Keypair.fromSecret('SPONSOR_SECRET');
const newUserKeypair = Keypair.random();

// Calculate cost
const cost = calculateEntryReserve('account', 1);
console.log('Sponsorship cost:', cost, 'XLM');

// Create sponsored account
const builder = new SponsoredAccountBuilder(networkConfig);
const result = await builder.createSponsoredAccount(
  sponsorKeypair.secret(),
  newUserKeypair.secret(),
  '0' // Starting balance can be 0 when sponsored
);

console.log('Account created:', result.hash);
```

#### Create Sponsored Trustlines

```typescript
import {
  SponsoredTrustlineBuilder,
  getDetailedBreakdown,
} from '@galaxy/core/stellar-sdk';

const assets = [
  { assetCode: 'USDC', assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  { assetCode: 'EURC', assetIssuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2' },
];

// Calculate cost
const breakdown = getDetailedBreakdown([{ type: 'trustline', count: assets.length }]);
console.log('Total cost:', breakdown.totalCost, 'XLM');

// Create sponsored trustlines
const builder = new SponsoredTrustlineBuilder(networkConfig);
const result = await builder.createMultipleSponsoredTrustlines(
  sponsorKeypair.secret(),
  userKeypair.secret(),
  assets
);

console.log('Trustlines created:', result.sponsoredEntries.length);
```

#### User Onboarding Template

For complete user onboarding (account + trustlines + data entries):

```typescript
import {
  UserOnboardingTemplate,
  calculateOnboardingCost,
  SponsoredReservesManager,
} from '@galaxy/core/stellar-sdk';

const onboardingConfig = {
  sponsorPublicKey: sponsorKeypair.publicKey(),
  newUserPublicKey: newUserKeypair.publicKey(),
  startingBalance: '0',
  trustlines: [
    { assetCode: 'USDC', assetIssuer: 'GBBD47IF...' },
    { assetCode: 'PLATFORM', assetIssuer: 'GPLATFORM...' },
  ],
  dataEntries: [
    { name: 'onboarded_at', value: new Date().toISOString() },
    { name: 'platform', value: 'galaxy-devkit' },
  ],
  memo: 'Welcome to Galaxy!',
};

// Calculate cost
const cost = calculateOnboardingCost(onboardingConfig);
console.log('Total onboarding cost:', cost.totalCost, 'XLM');

// Check sponsor eligibility
const manager = new SponsoredReservesManager(networkConfig);
const eligibility = await manager.checkSponsorshipEligibility(
  sponsorKeypair.publicKey(),
  cost
);

if (!eligibility.eligible) {
  console.error('Sponsor needs more XLM:', eligibility.shortfall);
  return;
}

// Execute onboarding
const template = new UserOnboardingTemplate(networkConfig);
const result = await template.onboardUser(
  onboardingConfig,
  sponsorKeypair.secret(),
  newUserKeypair.secret()
);

console.log('User onboarded:', result.hash);
```

#### Claimable Balances for Airdrops

Create sponsored claimable balances for token airdrops:

```typescript
import { ClaimableBalanceTemplate } from '@galaxy/core/stellar-sdk';

const recipients = [
  { destination: 'GUSER1...', amount: '100' },
  { destination: 'GUSER2...', amount: '100' },
  { destination: 'GUSER3...', amount: '100' },
];

const asset = { code: 'PLATFORM', issuer: 'GPLATFORM...' };
const expirationTime = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

const template = new ClaimableBalanceTemplate(networkConfig);
const results = await template.createSponsoredAirdrop(
  sponsorKeypair.secret(),
  sourceKeypair.secret(),
  asset,
  recipients,
  expirationTime
);

console.log('Airdrop created:', results.length, 'batches');
```

#### Vesting Schedules

Create time-locked token vesting:

```typescript
import { ClaimableBalanceTemplate } from '@galaxy/core/stellar-sdk';

// Create 4-tranche vesting over 1 year
const vestingSchedule = ClaimableBalanceTemplate.createLinearVestingSchedule(
  '10000', // Total tokens
  4, // Number of tranches
  Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // Start in 90 days
  90 * 24 * 60 * 60 // 90 days between tranches
);

const template = new ClaimableBalanceTemplate(networkConfig);
const result = await template.createSponsoredVesting(
  sponsorKeypair.secret(),
  sourceKeypair.secret(),
  asset,
  recipientPublicKey,
  vestingSchedule
);

console.log('Vesting created:', result.sponsoredEntries.length, 'tranches');
```

### Query Sponsored Entries

```typescript
import { SponsoredReservesManager } from '@galaxy/core/stellar-sdk';

const manager = new SponsoredReservesManager(networkConfig);

// Get entries sponsored FOR an account
const entriesFor = await manager.getSponsoredEntries(userPublicKey);

// Get entries sponsored BY an account
const entriesBy = await manager.getEntriesSponsoredBy(sponsorPublicKey);

// Filter by type
const trustlines = await manager.getSponsoredEntries(userPublicKey, {
  entryType: 'trustline',
});
```

### Revoking Sponsorship

```typescript
const manager = new SponsoredReservesManager(networkConfig);

// Revoke account sponsorship
await manager.revokeAccountSponsorship(
  sponsorKeypair.secret(),
  accountPublicKey
);

// Revoke trustline sponsorship
await manager.revokeTrustlineSponsorship(
  sponsorKeypair.secret(),
  accountPublicKey,
  { code: 'USDC', issuer: 'GBBD47IF...' }
);
```


## Path Payments (Swap & Path Finding)

Path payments enable cross-asset swaps and multi-hop payments using Stellar Horizon's path finding. Use **PathPaymentManager** for strict send (fixed send amount), strict receive (fixed receive amount), best-path selection, slippage protection, and swap analytics.

### Quick Start

```typescript
import {
  PathPaymentManager,
  Asset,
  Networks,
} from '@galaxy/core-stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';

const config = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: Networks.TESTNET,
};
const server = new Horizon.Server(config.horizonUrl);
const pathManager = new PathPaymentManager(server, config.passphrase);
```

### Find Paths (Strict Send / Strict Receive)

```typescript
// Strict send: fixed amount to send, discover how much you receive
const paths = await pathManager.findPaths({
  sourceAsset: Asset.native(),
  destAsset: new Asset('USDC', ISSUER),
  amount: '100.0000000',
  type: 'strict_send',
  limit: 15,
});

// Strict receive: fixed amount to receive, discover how much to send
const pathsReceive = await pathManager.findPaths({
  sourceAsset: Asset.native(),
  destAsset: new Asset('USDC', ISSUER),
  amount: '95.0000000',
  type: 'strict_receive',
});
```

### Best Path & Estimate

```typescript
const best = await pathManager.getBestPath(paths, 'strict_send');
const estimate = await pathManager.estimateSwap({
  sendAsset: Asset.native(),
  destAsset: new Asset('USDC', ISSUER),
  amount: '100.0000000',
  type: 'strict_send',
  maxSlippage: 1,
});
console.log('Output:', estimate.outputAmount, 'Price impact:', estimate.priceImpact, '%');
```

### Execute Swap with Slippage Protection

```typescript
const result = await pathManager.executeSwap(
  wallet,
  {
    sendAsset: Asset.native(),
    destAsset: new Asset('USDC', ISSUER),
    amount: '100.0000000',
    type: 'strict_send',
    maxSlippage: 1,
    minDestinationAmount: '94.0000000',
  },
  password,
  wallet.publicKey
);
console.log('Tx hash:', result.transactionHash, 'Output:', result.outputAmount);
```

### Slippage & Price Impact

- **maxSlippage**: Max allowed slippage (e.g. 1 = 1%).
- **minDestinationAmount** (strict send): Minimum amount to receive.
- **maxSendAmount** (strict receive): Maximum amount to send.
- **HIGH_PRICE_IMPACT_THRESHOLD** (5%): Paths above this trigger a high-impact warning.

See examples: `docs/examples/stellar-sdk/18-simple-swap.ts`, `19-path-finding.ts`, `20-multi-hop-swap.ts`, `21-slippage-protection.ts`.

---

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

### Cost Calculation


```typescript
import {
  calculateEntryReserve,
  getDetailedBreakdown,
  calculateTotalCost,
} from '@galaxy/core/stellar-sdk';

// Single entry cost
const accountCost = calculateEntryReserve('account', 1); // 1 XLM (2 base reserves)
const trustlineCost = calculateEntryReserve('trustline', 1); // 0.5 XLM

// Detailed breakdown
const breakdown = getDetailedBreakdown([
  { type: 'account', count: 1 },
  { type: 'trustline', count: 3 },
  { type: 'data', count: 2 },
]);

console.log('Breakdown:');
for (const item of breakdown.entries) {
  console.log(`  ${item.description}: ${item.cost} XLM`);
}
console.log('Total:', breakdown.totalCost, 'XLM');
console.log('Transaction fee:', breakdown.transactionFee, 'XLM');
```

### Multi-Signature Support

For scenarios where keys are held by different parties:

```typescript
import { SponsoredAccountBuilder } from '@galaxy/core/stellar-sdk';

const builder = new SponsoredAccountBuilder(networkConfig);

// Build unsigned transaction
const { xdr, requiredSigners } = await builder.buildUnsignedTransaction(
  sponsorPublicKey,
  newUserPublicKey,
  '0'
);

console.log('Transaction XDR:', xdr);
console.log('Required signers:', requiredSigners);

// Each party signs the XDR separately
// Then submit using signAndSubmitSponsorshipTransaction
```

## API Reference

### Classes

| Class | Description |
|-------|-------------|
| `StellarService` | Core service for Stellar operations |
| `SponsoredReservesManager` | Main manager for sponsored reserves operations |
| `SponsoredAccountBuilder` | Builder for sponsored account creation |
| `SponsoredTrustlineBuilder` | Builder for sponsored trustlines |
| `SponsoredClaimableBalanceBuilder` | Builder for sponsored claimable balances |
| `SponsoredSignerBuilder` | Builder for sponsored signers |
| `SponsoredDataEntryBuilder` | Builder for sponsored data entries |
| `UserOnboardingTemplate` | Template for complete user onboarding |
| `ClaimableBalanceTemplate` | Template for airdrops and vesting |
| `MultiOperationTemplate` | Template for batch operations |

### Utility Functions

| Function | Description |
|----------|-------------|
| `calculateEntryReserve(type, count)` | Calculate reserve for entry type |
| `getDetailedBreakdown(entries)` | Get detailed cost breakdown |
| `calculateTotalCost(config)` | Calculate total sponsorship cost |
| `calculateOnboardingCost(config)` | Calculate user onboarding cost |
| `validatePublicKey(key)` | Validate Stellar public key |
| `validateSecretKey(key)` | Validate Stellar secret key |
| `validateSponsorBalance(sponsor, required)` | Check sponsor has sufficient balance |

### Types

```typescript
interface NetworkConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  passphrase: string;
}

type SponsoredEntryType =
  | 'account'
  | 'trustline'
  | 'offer'
  | 'data'
  | 'claimableBalance'
  | 'signer';

interface SponsorshipResult {
  hash: string;
  ledger: number;
  status: 'success' | 'failed';
  feePaid: string;
  sponsoredEntries: SponsoredEntry[];
}

interface UserOnboardingConfig {
  sponsorPublicKey: string;
  newUserPublicKey: string;
  startingBalance: string;
  trustlines?: Array<{ assetCode: string; assetIssuer: string }>;
  dataEntries?: Array<{ name: string; value: string }>;
  memo?: string;
}
```

## Examples

See the [examples directory](../../docs/examples/stellar-sdk/) for complete working examples:

- `15-sponsor-account.ts` - Create sponsored accounts
- `16-sponsor-trustline.ts` - Create sponsored trustlines
- `17-onboarding-flow.ts` - Complete user onboarding flow

## Security Notes

### `privateKey` Field Convention

The `Wallet` and `WalletConfig` interfaces expose a `privateKey: string` field. **This value is always AES-256-GCM encrypted ciphertext** (format: `salt:iv:authTag:ciphertext`), never a raw Stellar secret key. This is a legacy naming convention.

To obtain the actual Stellar secret key for signing:

```typescript
import { decryptPrivateKey } from '@galaxy-kj/core-invisible-wallet';
import { Keypair } from '@stellar/stellar-sdk';

// wallet.privateKey is encrypted — decrypt before use
const secret = decryptPrivateKey(wallet.privateKey, userPassword);
const keypair = Keypair.fromSecret(secret);
```

### CSPRNG for Identifiers

All generated identifiers (wallet IDs, subscription IDs) use `crypto.randomBytes()` for cryptographic randomness instead of `Math.random()`.

## Testing

```bash
cd packages/core/stellar-sdk
npm test
```

## License

MIT License - see the [LICENSE](../../../LICENSE) file for details.
