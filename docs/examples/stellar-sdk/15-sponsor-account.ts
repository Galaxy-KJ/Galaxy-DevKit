/**
 * Example: Create a Sponsored Account
 *
 * This example demonstrates how to create a new Stellar account
 * with sponsored reserves. The sponsor pays the base reserve,
 * allowing the new user to have an account without holding XLM.
 */

import {
  SponsoredAccountBuilder,
  SponsoredReservesManager,
  calculateEntryReserve,
} from '@galaxy/core/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

// Network configuration
const networkConfig = {
  network: 'testnet' as const,
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function createSponsoredAccount() {
  // Generate keypairs (in production, use secure key management)
  const sponsorKeypair = Keypair.fromSecret('SPONSOR_SECRET_KEY');
  const newUserKeypair = Keypair.random();

  console.log('New user public key:', newUserKeypair.publicKey());

  // Calculate the cost
  const cost = calculateEntryReserve('account', 1);
  console.log('Sponsorship cost:', cost, 'XLM');

  // Check sponsor eligibility
  const manager = new SponsoredReservesManager(networkConfig);
  const eligibility = await manager.checkSponsorshipEligibility(
    sponsorKeypair.publicKey(),
    {
      sponsorPublicKey: sponsorKeypair.publicKey(),
      sponsoredPublicKey: newUserKeypair.publicKey(),
      entryType: 'account',
    }
  );

  if (!eligibility.eligible) {
    console.error('Sponsor not eligible:', eligibility.reason);
    return;
  }

  console.log('Sponsor eligible. Current balance:', eligibility.currentBalance);

  // Create the sponsored account
  const builder = new SponsoredAccountBuilder(networkConfig);

  try {
    const result = await builder.createSponsoredAccount(
      sponsorKeypair.secret(),
      newUserKeypair.secret(),
      '0' // Starting balance can be 0 when sponsored
    );

    console.log('Account created successfully!');
    console.log('Transaction hash:', result.hash);
    console.log('Ledger:', result.ledger);
    console.log('Status:', result.status);

    // The new user now has an account without needing to hold XLM for reserves
    // The sponsor's reserves are used instead
  } catch (error) {
    console.error('Failed to create account:', error);
  }
}

// For multi-signature scenarios (e.g., when keys are held by different parties)
async function createSponsoredAccountMultiSig() {
  const sponsorPublicKey = 'GSPONSOR...';
  const newUserPublicKey = 'GNEWUSER...';

  const builder = new SponsoredAccountBuilder(networkConfig);

  // Build unsigned transaction
  const { xdr, requiredSigners } = await builder.buildUnsignedTransaction(
    sponsorPublicKey,
    newUserPublicKey,
    '0'
  );

  console.log('Transaction XDR:', xdr);
  console.log('Required signers:', requiredSigners);

  // The XDR can now be sent to each signer for signing
  // Then submitted using signAndSubmitSponsorshipTransaction
}

createSponsoredAccount();
