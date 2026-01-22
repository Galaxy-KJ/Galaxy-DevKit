/**
 * Example: Time-Locked Payment
 * 
 * This example demonstrates:
 * - Creating a time-locked claimable balance
 * - Using absolute time predicates
 * - Using relative time predicates
 * - Claiming after the unlock time
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  beforeAbsoluteTime,
  beforeRelativeTime,
} from '@galaxy/core-stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);
  const password = 'your-secure-password';

  // Create wallets
  const senderWallet = await service.createWallet({}, password);
  const recipientWallet = await service.createWallet({}, password);

  console.log('Sender:', senderWallet.publicKey);
  console.log('Recipient:', recipientWallet.publicKey);
  console.log('\nPlease fund sender wallet:', senderWallet.publicKey);

  // Example 1: Absolute time lock (unlock on specific date)
  console.log('\n=== Example 1: Absolute Time Lock ===');
  const unlockDate = new Date();
  unlockDate.setDate(unlockDate.getDate() + 7); // 7 days from now

  console.log('Creating time-locked balance (unlocks on):', unlockDate.toISOString());

  const absoluteTimeResult = await service.createClaimableBalance(
    senderWallet,
    {
      asset: Asset.native(),
      amount: '500.0000000',
      claimants: [
        {
          destination: recipientWallet.publicKey,
          predicate: beforeAbsoluteTime(unlockDate),
        },
      ],
      memo: 'Time-locked payment - 7 days',
    },
    password
  );

  console.log('Balance ID:', absoluteTimeResult.balanceId);
  console.log('Transaction Hash:', absoluteTimeResult.hash);

  // Check if balance is claimable
  const balance1 = await service.getClaimableBalance(absoluteTimeResult.balanceId);
  console.log('Balance amount:', balance1.amount);
  console.log('Unlock date:', unlockDate.toISOString());
  console.log('Current time:', new Date().toISOString());

  if (new Date() < unlockDate) {
    console.log('⚠️  Balance is locked until unlock date');
  } else {
    console.log('✅ Balance can be claimed now');
  }

  // Example 2: Relative time lock (unlock after X seconds)
  console.log('\n=== Example 2: Relative Time Lock ===');
  const relativeSeconds = 3600; // 1 hour
  console.log('Creating relative time-locked balance (unlocks in', relativeSeconds, 'seconds)');

  const relativeTimeResult = await service.createClaimableBalance(
    senderWallet,
    {
      asset: Asset.native(),
      amount: '300.0000000',
      claimants: [
        {
          destination: recipientWallet.publicKey,
          predicate: beforeRelativeTime(relativeSeconds),
        },
      ],
      memo: 'Time-locked payment - 1 hour',
    },
    password
  );

  console.log('Balance ID:', relativeTimeResult.balanceId);
  console.log('Transaction Hash:', relativeTimeResult.hash);

  // Example 3: Multiple time-locked balances (vesting-like)
  console.log('\n=== Example 3: Multiple Time-Locked Balances ===');
  const dates = [
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
  ];

  const amounts = ['333.3333333', '333.3333333', '333.3333334']; // Total: 1000 XLM

  for (let i = 0; i < dates.length; i++) {
    console.log(`\nCreating balance ${i + 1}/3 (unlocks on ${dates[i].toISOString()})`);
    
    const result = await service.createClaimableBalance(
      senderWallet,
      {
        asset: Asset.native(),
        amount: amounts[i],
        claimants: [
          {
            destination: recipientWallet.publicKey,
            predicate: beforeAbsoluteTime(dates[i]),
          },
        ],
        memo: `Vesting payment ${i + 1}/3`,
      },
      password
    );

    console.log('Balance ID:', result.balanceId);
  }

  console.log('\n✅ All time-locked balances created!');
  console.log('Recipient can claim each balance after its unlock date.');
}

main().catch(console.error);
