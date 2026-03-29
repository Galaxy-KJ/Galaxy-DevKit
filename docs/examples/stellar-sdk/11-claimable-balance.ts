/**
 * Example: Create and Claim Claimable Balance
 * 
 * This example demonstrates:
 * - Creating a claimable balance with unconditional predicate
 * - Claiming a claimable balance
 * - Querying claimable balances
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  unconditional,
} from '@galaxy/core-stellar-sdk';

// Network configuration
const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);
  const password = 'your-secure-password';

  // Step 1: Create wallets for sender and recipient
  console.log('Creating wallets...');
  const senderWallet = await service.createWallet({}, password);
  const recipientWallet = await service.createWallet({}, password);

  console.log('Sender:', senderWallet.publicKey);
  console.log('Recipient:', recipientWallet.publicKey);

  // Step 2: Fund sender wallet (required for creating claimable balance)
  // Note: In testnet, use friendbot or manual funding
  console.log('\nPlease fund sender wallet:', senderWallet.publicKey);

  // Step 3: Create a claimable balance
  console.log('\nCreating claimable balance...');
  const createResult = await service.createClaimableBalance(
    senderWallet,
    {
      asset: Asset.native(),
      amount: '100.0000000',
      claimants: [
        {
          destination: recipientWallet.publicKey,
          predicate: unconditional(), // Can claim anytime
        },
      ],
      memo: 'Test claimable balance',
    },
    password
  );

  console.log('Balance created!');
  console.log('Balance ID:', createResult.balanceId);
  console.log('Transaction Hash:', createResult.hash);
  console.log('Status:', createResult.status);

  // Step 4: Query the balance details
  console.log('\nQuerying balance details...');
  const balance = await service.getClaimableBalance(createResult.balanceId);
  console.log('Balance Amount:', balance.amount);
  console.log('Balance Asset:', balance.asset.getCode());
  console.log('Claimants:', balance.claimants.length);

  // Step 5: Query all claimable balances for recipient
  console.log('\nQuerying claimable balances for recipient...');
  const recipientBalances = await service.getClaimableBalancesForAccount(
    recipientWallet.publicKey,
    10
  );
  console.log('Found', recipientBalances.length, 'claimable balances');

  // Step 6: Claim the balance
  console.log('\nClaiming balance...');
  const claimResult = await service.claimBalance(
    recipientWallet,
    {
      balanceId: createResult.balanceId,
    },
    password
  );

  console.log('Balance claimed!');
  console.log('Transaction Hash:', claimResult.hash);
  console.log('Status:', claimResult.status);

  // Step 7: Verify balance was claimed (should return empty or not found)
  try {
    const claimedBalance = await service.getClaimableBalance(
      createResult.balanceId
    );
    console.log('Balance still exists:', claimedBalance);
  } catch (error) {
    console.log('Balance successfully claimed and removed from ledger');
  }
}

// Run the example
main().catch(console.error);
