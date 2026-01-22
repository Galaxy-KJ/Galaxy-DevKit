# @galaxy/core/stellar-sdk

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

## Testing

```bash
cd packages/core/stellar-sdk
npm test
```

## License

MIT License - see the [LICENSE](../../../LICENSE) file for details.
