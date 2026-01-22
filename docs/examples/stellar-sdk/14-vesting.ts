/**
 * Example: Token Vesting Schedule
 * 
 * This example demonstrates:
 * - Creating vesting schedules with multiple claimable balances
 * - Time-based vesting (cliff and linear)
 * - Percentage-based vesting periods
 * - Claiming vested tokens
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  createVestingSchedule,
} from '@galaxy/core-stellar-sdk';
import {
  TransactionBuilder,
  BASE_FEE,
  Horizon,
} from '@stellar/stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);
  const password = 'your-secure-password';

  // Create wallets
  const companyWallet = await service.createWallet({}, password);
  const employeeWallet = await service.createWallet({}, password);

  console.log('Company Wallet:', companyWallet.publicKey);
  console.log('Employee Wallet:', employeeWallet.publicKey);
  console.log('\nPlease fund company wallet:', companyWallet.publicKey);

  // Example 1: Linear Vesting (4 equal payments over 1 year)
  console.log('\n=== Example 1: Linear Vesting (4 Equal Payments) ===');
  const now = Date.now();
  const vestingPeriods = [
    { date: new Date(now + 90 * 24 * 60 * 60 * 1000), percentage: 25 }, // 3 months
    { date: new Date(now + 180 * 24 * 60 * 60 * 1000), percentage: 25 }, // 6 months
    { date: new Date(now + 270 * 24 * 60 * 60 * 1000), percentage: 25 }, // 9 months
    { date: new Date(now + 365 * 24 * 60 * 60 * 1000), percentage: 25 }, // 12 months
  ];

  console.log('Creating vesting schedule:');
  vestingPeriods.forEach((period, index) => {
    console.log(
      `  Period ${index + 1}: ${period.percentage}% on ${period.date.toISOString()}`
    );
  });

  // Load source account
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const sourceAccount = await server.loadAccount(companyWallet.publicKey);

  // Create vesting schedule operations
  const vestingOperations = createVestingSchedule(sourceAccount, {
    asset: Asset.native(),
    totalAmount: '10000.0000000', // 10,000 XLM
    claimant: employeeWallet.publicKey,
    vestingPeriods: vestingPeriods,
  });

  console.log(`\nCreated ${vestingOperations.length} vesting operations`);

  // Build transaction with all vesting operations
  const txBuilder = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkConfig.passphrase,
  });

  vestingOperations.forEach((op) => {
    txBuilder.addOperation(op);
  });

  txBuilder.setTimeout(180);

  // Note: In real implementation, you would sign and submit this transaction
  console.log('Vesting schedule transaction ready to submit');
  console.log('Each operation creates a separate claimable balance');

  // Example 2: Cliff + Linear Vesting
  console.log('\n=== Example 2: Cliff + Linear Vesting ===');
  const cliffDate = new Date(now + 180 * 24 * 60 * 60 * 1000); // 6 month cliff
  const monthlyVesting = [
    { date: new Date(now + 180 * 24 * 60 * 60 * 1000), percentage: 20 }, // Cliff: 20% at 6 months
    { date: new Date(now + 210 * 24 * 60 * 60 * 1000), percentage: 10 }, // 7 months: 10%
    { date: new Date(now + 240 * 24 * 60 * 60 * 1000), percentage: 10 }, // 8 months: 10%
    { date: new Date(now + 270 * 24 * 60 * 60 * 1000), percentage: 10 }, // 9 months: 10%
    { date: new Date(now + 300 * 24 * 60 * 60 * 1000), percentage: 10 }, // 10 months: 10%
    { date: new Date(now + 330 * 24 * 60 * 60 * 1000), percentage: 10 }, // 11 months: 10%
    { date: new Date(now + 365 * 24 * 60 * 60 * 1000), percentage: 10 }, // 12 months: 10%
    { date: new Date(now + 395 * 24 * 60 * 60 * 1000), percentage: 10 }, // 13 months: 10%
    { date: new Date(now + 425 * 24 * 60 * 60 * 1000), percentage: 10 }, // 14 months: 10%
  ];

  console.log('Cliff + Linear Vesting Schedule:');
  console.log(`  Cliff: 20% on ${cliffDate.toISOString()}`);
  console.log('  Monthly: 10% each month after cliff');

  const cliffOperations = createVestingSchedule(sourceAccount, {
    asset: Asset.native(),
    totalAmount: '5000.0000000', // 5,000 XLM
    claimant: employeeWallet.publicKey,
    vestingPeriods: monthlyVesting,
  });

  console.log(`\nCreated ${cliffOperations.length} vesting operations`);

  // Example 3: Custom Asset Vesting
  console.log('\n=== Example 3: Custom Asset Vesting ===');
  const customAsset = new Asset('TOKEN', 'G...'); // Replace with actual issuer

  // Note: Employee must have trustline for custom asset before claiming
  console.log('Creating vesting schedule for custom asset...');
  console.log('⚠️  Employee must establish trustline before claiming');

  const customVestingPeriods = [
    { date: new Date(now + 30 * 24 * 60 * 60 * 1000), percentage: 50 }, // 1 month: 50%
    { date: new Date(now + 90 * 24 * 60 * 60 * 1000), percentage: 50 }, // 3 months: 50%
  ];

  const customOperations = createVestingSchedule(sourceAccount, {
    asset: customAsset,
    totalAmount: '1000000.0000000', // 1,000,000 tokens
    claimant: employeeWallet.publicKey,
    vestingPeriods: customVestingPeriods,
  });

  console.log(`Created ${customOperations.length} custom asset vesting operations`);

  // Example 4: Querying and Claiming Vested Tokens
  console.log('\n=== Example 4: Querying and Claiming Vested Tokens ===');
  
  // Query all claimable balances for employee
  const employeeBalances = await service.getClaimableBalancesForAccount(
    employeeWallet.publicKey,
    100
  );

  console.log(`\nEmployee has ${employeeBalances.length} claimable balances`);

  // Filter balances that are currently claimable
  const claimableNow = employeeBalances.filter((balance) => {
    // Check if any claimant has unconditional predicate or time has passed
    return balance.claimants.some((claimant) => {
      if ('unconditional' in claimant.predicate) {
        return true;
      }
      if ('abs_before' in claimant.predicate) {
        const deadline = new Date(claimant.predicate.abs_before);
        return Date.now() < deadline.getTime();
      }
      return false;
    });
  });

  console.log(`${claimableNow.length} balances are currently claimable`);

  // Claim the first available balance
  if (claimableNow.length > 0) {
    console.log('\nClaiming first available balance...');
    const claimResult = await service.claimBalance(
      employeeWallet,
      {
        balanceId: claimableNow[0].id,
      },
      password
    );

    console.log('✅ Balance claimed!');
    console.log('Transaction Hash:', claimResult.hash);
  }

  console.log('\n✅ Vesting examples completed!');
  console.log('\nVesting Use Cases:');
  console.log('1. Employee token grants with time-based release');
  console.log('2. Advisor compensation with milestone-based vesting');
  console.log('3. Investor token distribution with cliff periods');
  console.log('4. Team allocation with linear vesting schedules');
}

main().catch(console.error);
