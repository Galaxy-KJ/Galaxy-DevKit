/**
 * Example: Complete User Onboarding Flow
 *
 * This example demonstrates a complete user onboarding flow using
 * sponsored reserves. It creates a new account, adds trustlines,
 * and sets up data entries - all sponsored by a platform account.
 */

import {
  UserOnboardingTemplate,
  ClaimableBalanceTemplate,
  MultiOperationTemplate,
  calculateOnboardingCost,
  SponsoredReservesManager,
} from '@galaxy/core/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

// Network configuration
const networkConfig = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

// Platform's common assets
const PLATFORM_ASSETS = [
  {
    assetCode: 'USDC',
    assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
  {
    assetCode: 'PLATFORM',
    assetIssuer: 'GPLATFORM_ISSUER...',
  },
];

/**
 * Complete onboarding: account + trustlines + data
 */
async function onboardNewUser() {
  const sponsorKeypair = Keypair.fromSecret('PLATFORM_SPONSOR_SECRET');
  const newUserKeypair = Keypair.random();

  console.log('=== User Onboarding ===');
  console.log('New user public key:', newUserKeypair.publicKey());

  // Create onboarding configuration
  const onboardingConfig = {
    sponsorPublicKey: sponsorKeypair.publicKey(),
    newUserPublicKey: newUserKeypair.publicKey(),
    startingBalance: '0',
    trustlines: PLATFORM_ASSETS,
    dataEntries: [
      { name: 'onboarded_at', value: new Date().toISOString() },
      { name: 'platform', value: 'galaxy-devkit' },
    ],
    memo: 'Welcome to Galaxy!',
  };

  // Calculate and display cost
  const cost = calculateOnboardingCost(onboardingConfig);
  console.log('\nOnboarding cost breakdown:');
  console.log('  Total cost:', cost.totalCost, 'XLM');
  console.log('  Entries:');
  for (const item of cost.breakdown) {
    console.log(`    - ${item.description}: ${item.cost} XLM (x${item.count})`);
  }
  console.log('  Transaction fee:', cost.transactionFee, 'XLM');

  // Check sponsor eligibility
  const manager = new SponsoredReservesManager(networkConfig);
  const eligibility = await manager.checkSponsorshipEligibility(
    sponsorKeypair.publicKey(),
    cost
  );

  if (!eligibility.eligible) {
    console.error('\nSponsor not eligible:', eligibility.reason);
    console.error('  Current balance:', eligibility.currentBalance, 'XLM');
    console.error('  Required balance:', eligibility.requiredBalance, 'XLM');
    console.error('  Shortfall:', eligibility.shortfall, 'XLM');
    return;
  }

  console.log('\nSponsor eligible. Proceeding with onboarding...');

  // Execute onboarding
  const template = new UserOnboardingTemplate(networkConfig);

  try {
    const result = await template.onboardUser(
      onboardingConfig,
      sponsorKeypair.secret(),
      newUserKeypair.secret()
    );

    console.log('\n=== Onboarding Complete ===');
    console.log('Transaction hash:', result.hash);
    console.log('Ledger:', result.ledger);
    console.log('Status:', result.status);
    console.log('Fee paid:', result.feePaid, 'stroops');
    console.log('\nSponsored entries:');
    for (const entry of result.sponsoredEntries) {
      console.log(`  - ${entry.type}: ${entry.id || 'N/A'}`);
    }

    // Return the new user's keypair for them to store securely
    return {
      publicKey: newUserKeypair.publicKey(),
      secretKey: newUserKeypair.secret(), // User should store this securely
    };
  } catch (error) {
    console.error('Onboarding failed:', error);
    throw error;
  }
}

/**
 * Create a sponsored airdrop using claimable balances
 */
async function createSponsoredAirdrop() {
  const sponsorKeypair = Keypair.fromSecret('PLATFORM_SPONSOR_SECRET');
  const sourceKeypair = Keypair.fromSecret('AIRDROP_SOURCE_SECRET');

  const recipients = [
    { destination: 'GUSER1...', amount: '100' },
    { destination: 'GUSER2...', amount: '100' },
    { destination: 'GUSER3...', amount: '100' },
  ];

  const asset = {
    code: 'PLATFORM',
    issuer: 'GPLATFORM_ISSUER...',
  };

  // Expiration in 30 days
  const expirationTime = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  const template = new ClaimableBalanceTemplate(networkConfig);

  try {
    const results = await template.createSponsoredAirdrop(
      sponsorKeypair.secret(),
      sourceKeypair.secret(),
      asset,
      recipients,
      expirationTime
    );

    console.log('=== Airdrop Created ===');
    for (const result of results) {
      console.log('Batch transaction:', result.hash);
      console.log('  Status:', result.status);
      console.log('  Entries:', result.sponsoredEntries.length);
    }

    // Recipients can now claim their tokens without needing XLM
  } catch (error) {
    console.error('Airdrop failed:', error);
  }
}

/**
 * Create a sponsored vesting schedule
 */
async function createSponsoredVesting() {
  const sponsorKeypair = Keypair.fromSecret('PLATFORM_SPONSOR_SECRET');
  const sourceKeypair = Keypair.fromSecret('VESTING_SOURCE_SECRET');
  const recipientPublicKey = 'GEMPLOYEE...';

  const asset = {
    code: 'PLATFORM',
    issuer: 'GPLATFORM_ISSUER...',
  };

  // Create a 4-tranche vesting schedule over 1 year
  const vestingSchedule = ClaimableBalanceTemplate.createLinearVestingSchedule(
    '10000', // Total 10,000 tokens
    4, // 4 tranches
    Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // Start in 90 days
    90 * 24 * 60 * 60 // 90 days between each tranche
  );

  console.log('Vesting schedule:');
  for (const tranche of vestingSchedule) {
    console.log(`  - ${tranche.amount} tokens unlock at ${new Date(tranche.unlockTime * 1000).toISOString()}`);
  }

  const template = new ClaimableBalanceTemplate(networkConfig);

  try {
    const result = await template.createSponsoredVesting(
      sponsorKeypair.secret(),
      sourceKeypair.secret(),
      asset,
      recipientPublicKey,
      vestingSchedule
    );

    console.log('\n=== Vesting Created ===');
    console.log('Transaction hash:', result.hash);
    console.log('Claimable balances created:', result.sponsoredEntries.length);
  } catch (error) {
    console.error('Vesting creation failed:', error);
  }
}

/**
 * Query all sponsored entries for an account
 */
async function queryAllSponsoredEntries() {
  const userPublicKey = 'GUSER...';

  const manager = new SponsoredReservesManager(networkConfig);

  try {
    const entries = await manager.getSponsoredEntries(userPublicKey);

    console.log('=== Sponsored Entries ===');
    console.log(`Total entries: ${entries.length}`);

    // Group by type
    const byType: Record<string, typeof entries> = {};
    for (const entry of entries) {
      if (!byType[entry.entryType]) {
        byType[entry.entryType] = [];
      }
      byType[entry.entryType].push(entry);
    }

    for (const [type, typeEntries] of Object.entries(byType)) {
      console.log(`\n${type.toUpperCase()} (${typeEntries.length}):`);
      for (const entry of typeEntries) {
        console.log(`  - ID: ${entry.entryId}`);
        console.log(`    Sponsor: ${entry.sponsor}`);
      }
    }
  } catch (error) {
    console.error('Query failed:', error);
  }
}

// Run the examples
onboardNewUser();
