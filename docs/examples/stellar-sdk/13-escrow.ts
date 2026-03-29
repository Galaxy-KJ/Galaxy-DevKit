/**
 * Example: Escrow Implementation
 * 
 * This example demonstrates:
 * - Creating multi-party escrow
 * - Two-party escrow with arbitrator
 * - Time-locked escrow releases
 * - Dispute resolution with arbitrator
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  createEscrow,
  createTwoPartyEscrow,
  unconditional,
  beforeAbsoluteTime,
} from '@galaxy/core-stellar-sdk';
import { TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);
  const password = 'your-secure-password';

  // Create wallets for all parties
  const buyerWallet = await service.createWallet({}, password);
  const sellerWallet = await service.createWallet({}, password);
  const arbitratorWallet = await service.createWallet({}, password);
  const escrowWallet = await service.createWallet({}, password);

  console.log('Buyer:', buyerWallet.publicKey);
  console.log('Seller:', sellerWallet.publicKey);
  console.log('Arbitrator:', arbitratorWallet.publicKey);
  console.log('Escrow Account:', escrowWallet.publicKey);
  console.log('\nPlease fund escrow wallet:', escrowWallet.publicKey);

  // Example 1: Simple Multi-Party Escrow
  console.log('\n=== Example 1: Multi-Party Escrow ===');
  console.log('Creating escrow with buyer, seller, and arbitrator...');

  const escrowOperation = createEscrow({
    asset: Asset.native(),
    amount: '1000.0000000',
    parties: [buyerWallet.publicKey, sellerWallet.publicKey],
    releaseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    arbitrator: arbitratorWallet.publicKey,
  });

  // Build and submit transaction
  const escrowAccount = await service.getAccountInfo(escrowWallet.publicKey);
  const txBuilder = new TransactionBuilder(escrowAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkConfig.passphrase,
  });

  txBuilder.addOperation(escrowOperation);
  txBuilder.setTimeout(180);

  // Note: In real implementation, you would sign and submit this transaction
  console.log('Escrow operation created (ready to submit)');
  console.log('Parties can claim after release date');
  console.log('Arbitrator can claim anytime for dispute resolution');

  // Example 2: Two-Party Escrow with Arbitrator
  console.log('\n=== Example 2: Two-Party Escrow with Arbitrator ===');
  const releaseDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const twoPartyEscrowOp = createTwoPartyEscrow({
    asset: Asset.native(),
    amount: '5000.0000000',
    buyer: buyerWallet.publicKey,
    seller: sellerWallet.publicKey,
    arbitrator: arbitratorWallet.publicKey,
    releaseDate: releaseDate,
  });

  console.log('Two-party escrow operation created');
  console.log('Release date:', releaseDate.toISOString());
  console.log('Buyer and seller can claim after release date');
  console.log('Arbitrator can claim anytime');

  // Example 3: Conditional Escrow with Complex Predicates
  console.log('\n=== Example 3: Conditional Escrow ===');
  console.log('Creating escrow with complex conditions...');

  const conditionalResult = await service.createClaimableBalance(
    escrowWallet,
    {
      asset: Asset.native(),
      amount: '2000.0000000',
      claimants: [
        {
          destination: buyerWallet.publicKey,
          predicate: beforeAbsoluteTime(releaseDate), // Buyer can claim after release
        },
        {
          destination: sellerWallet.publicKey,
          predicate: beforeAbsoluteTime(releaseDate), // Seller can claim after release
        },
        {
          destination: arbitratorWallet.publicKey,
          predicate: unconditional(), // Arbitrator can claim anytime
        },
      ],
      memo: 'Conditional escrow with arbitrator',
    },
    password
  );

  console.log('Conditional escrow created!');
  console.log('Balance ID:', conditionalResult.balanceId);
  console.log('Transaction Hash:', conditionalResult.hash);

  // Query the escrow balance
  const escrowBalance = await service.getClaimableBalance(conditionalResult.balanceId);
  console.log('\nEscrow Balance Details:');
  console.log('Amount:', escrowBalance.amount);
  console.log('Claimants:', escrowBalance.claimants.length);
  escrowBalance.claimants.forEach((claimant, index) => {
    console.log(`  Claimant ${index + 1}:`, claimant.destination);
    console.log(`    Predicate:`, JSON.stringify(claimant.predicate));
  });

  // Example 4: Immediate Release Escrow (No Time Lock)
  console.log('\n=== Example 4: Immediate Release Escrow ===');
  const immediateResult = await service.createClaimableBalance(
    escrowWallet,
    {
      asset: Asset.native(),
      amount: '750.0000000',
      claimants: [
        {
          destination: buyerWallet.publicKey,
          predicate: unconditional(), // Can claim immediately
        },
        {
          destination: sellerWallet.publicKey,
          predicate: unconditional(), // Can claim immediately
        },
        {
          destination: arbitratorWallet.publicKey,
          predicate: unconditional(), // Arbitrator can claim anytime
        },
      ],
      memo: 'Immediate release escrow',
    },
    password
  );

  console.log('Immediate release escrow created!');
  console.log('Balance ID:', immediateResult.balanceId);
  console.log('⚠️  First party to claim will receive the balance');

  console.log('\n✅ All escrow examples completed!');
  console.log('\nEscrow Use Cases:');
  console.log('1. Buyer/Seller transactions with dispute resolution');
  console.log('2. Time-locked releases for milestone payments');
  console.log('3. Multi-party agreements with arbitrator');
  console.log('4. Conditional releases based on external events');
}

main().catch(console.error);
