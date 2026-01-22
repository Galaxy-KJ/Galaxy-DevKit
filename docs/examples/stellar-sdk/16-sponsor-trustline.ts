/**
 * Example: Create Sponsored Trustlines
 *
 * This example demonstrates how to create trustlines with sponsored reserves.
 * Useful for enabling users to hold custom assets without paying for reserves.
 */

import {
  SponsoredTrustlineBuilder,
  SponsoredReservesManager,
  getDetailedBreakdown,
} from '@galaxy/core/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

// Network configuration
const networkConfig = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

// Common assets on Stellar
const USDC_TESTNET = {
  assetCode: 'USDC',
  assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // Example issuer
};

const EURC_TESTNET = {
  assetCode: 'EURC',
  assetIssuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2', // Example issuer
};

async function createSponsoredTrustline() {
  const sponsorKeypair = Keypair.fromSecret('SPONSOR_SECRET_KEY');
  const userKeypair = Keypair.fromSecret('USER_SECRET_KEY');

  // Calculate cost for single trustline
  const breakdown = getDetailedBreakdown([{ type: 'trustline', count: 1 }]);
  console.log('Sponsorship cost breakdown:');
  console.log('  Total cost:', breakdown.totalCost, 'XLM');
  console.log('  Transaction fee:', breakdown.transactionFee, 'XLM');

  const builder = new SponsoredTrustlineBuilder(networkConfig);

  try {
    const result = await builder.createSponsoredTrustline(
      sponsorKeypair.secret(),
      userKeypair.secret(),
      USDC_TESTNET.assetCode,
      USDC_TESTNET.assetIssuer
    );

    console.log('Trustline created successfully!');
    console.log('Transaction hash:', result.hash);
    console.log('Status:', result.status);

    // User can now receive USDC without paying for the trustline reserve
  } catch (error) {
    console.error('Failed to create trustline:', error);
  }
}

async function createMultipleSponsoredTrustlines() {
  const sponsorKeypair = Keypair.fromSecret('SPONSOR_SECRET_KEY');
  const userKeypair = Keypair.fromSecret('USER_SECRET_KEY');

  const assets = [
    USDC_TESTNET,
    EURC_TESTNET,
    { assetCode: 'BTC', assetIssuer: 'GBTC_ISSUER...' },
  ];

  // Calculate cost for multiple trustlines
  const breakdown = getDetailedBreakdown([{ type: 'trustline', count: assets.length }]);
  console.log(`Cost for ${assets.length} trustlines: ${breakdown.totalCost} XLM`);

  const builder = new SponsoredTrustlineBuilder(networkConfig);

  try {
    const result = await builder.createMultipleSponsoredTrustlines(
      sponsorKeypair.secret(),
      userKeypair.secret(),
      assets
    );

    console.log('Multiple trustlines created successfully!');
    console.log('Transaction hash:', result.hash);
    console.log('Sponsored entries:', result.sponsoredEntries.length);
  } catch (error) {
    console.error('Failed to create trustlines:', error);
  }
}

async function querySponsoredTrustlines() {
  const userPublicKey = 'GUSER...';

  const manager = new SponsoredReservesManager(networkConfig);

  try {
    const entries = await manager.getSponsoredEntries(userPublicKey, {
      entryType: 'trustline',
    });

    console.log('Sponsored trustlines for account:');
    for (const entry of entries) {
      console.log(`  - ${entry.entryId}`);
      console.log(`    Sponsor: ${entry.sponsor}`);
      console.log(`    Asset: ${JSON.stringify(entry.details.asset)}`);
    }
  } catch (error) {
    console.error('Failed to query sponsored entries:', error);
  }
}

createSponsoredTrustline();
