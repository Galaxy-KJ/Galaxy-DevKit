/**
 * Example: Slippage Protection
 *
 * This example demonstrates:
 * - Calculating slippage tolerance
 * - Setting price bounds for deposits
 * - Using minimum amounts for withdrawals
 * - Detecting high price impact
 * - Protecting against unfavorable trades
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  calculateMinimumAmounts,
  calculatePriceBounds,
  calculatePriceImpact,
  wouldImpactPrice,
  calculateSpotPrice,
} from '@galaxy/core-stellar-sdk';
import BigNumber from 'bignumber.js';

// Network configuration
const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);
  const password = 'your-secure-password';

  // Step 1: Create wallet
  console.log('Creating wallet...');
  const wallet = await service.createWallet({}, password);
  console.log('Wallet:', wallet.publicKey);
  console.log('\nPlease fund wallet before proceeding\n');

  // Step 2: Find a pool
  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  const pools = await service.getPoolsForAssets(xlm, usdc);
  if (pools.length === 0) {
    console.log('No pools found');
    return;
  }

  const pool = pools[0];
  console.log(`Using pool: ${pool.id.substring(0, 16)}...`);

  // Step 3: Example 1 - Deposit with slippage protection
  console.log('\n=== Example 1: Deposit with Slippage Protection ===\n');

  const depositAmountA = '100.0000000';
  const depositAmountB = '500.0000000';
  const slippageTolerance = '0.01'; // 1%

  // Calculate minimum amounts
  const { minAmountA, minAmountB } = calculateMinimumAmounts(
    depositAmountA,
    depositAmountB,
    slippageTolerance
  );

  console.log('Deposit Details:');
  console.log(`- Max Amount A: ${depositAmountA}`);
  console.log(`- Max Amount B: ${depositAmountB}`);
  console.log(`- Slippage Tolerance: ${slippageTolerance} (1%)`);
  console.log(`- Min Amount A: ${minAmountA}`);
  console.log(`- Min Amount B: ${minAmountB}`);

  // Estimate deposit
  const depositEstimate = await service.estimatePoolDeposit(
    pool.id,
    depositAmountA,
    depositAmountB
  );

  console.log(`\nEstimated Results:`);
  console.log(`- Expected shares: ${depositEstimate.shares}`);
  console.log(`- Price impact: ${depositEstimate.priceImpact}%`);

  if (parseFloat(depositEstimate.priceImpact) > 5) {
    console.log('⚠️  WARNING: High price impact (>5%)!');
    console.log('Consider reducing deposit amount');
  } else {
    console.log('✓ Price impact acceptable');
  }

  // Execute deposit with slippage protection
  console.log('\nExecuting deposit with slippage protection...');
  try {
    const depositResult = await service.depositLiquidity(
      wallet,
      {
        poolId: pool.id,
        maxAmountA: depositAmountA,
        maxAmountB: depositAmountB,
        slippageTolerance: slippageTolerance,
        memo: 'Protected deposit',
      },
      password
    );
    console.log('✓ Deposit successful');
    console.log('Transaction Hash:', depositResult.hash);
  } catch (error) {
    console.log('✗ Deposit failed (possibly due to slippage)');
    console.error(error);
  }

  // Step 4: Example 2 - Deposit with price bounds
  console.log('\n=== Example 2: Deposit with Price Bounds ===\n');

  // Calculate current spot price
  const currentPrice = new BigNumber(pool.reserveB).dividedBy(pool.reserveA).toFixed(7);
  console.log(`Current spot price: ${currentPrice}`);

  // Calculate price bounds for 2% tolerance
  const priceTolerance = '0.02'; // 2%
  const { minPrice, maxPrice, spotPrice, tolerancePercent } = calculatePriceBounds(
    currentPrice,
    priceTolerance
  );

  console.log(`\nPrice Bounds:`);
  console.log(`- Spot Price: ${spotPrice}`);
  console.log(`- Min Price: ${minPrice}`);
  console.log(`- Max Price: ${maxPrice}`);
  console.log(`- Tolerance: ${tolerancePercent}%`);

  // Deposit with price bounds
  console.log('\nExecuting deposit with price bounds...');
  try {
    const boundedDepositResult = await service.depositLiquidity(
      wallet,
      {
        poolId: pool.id,
        maxAmountA: '50.0000000',
        maxAmountB: '250.0000000',
        minPrice: minPrice,
        maxPrice: maxPrice,
        memo: 'Price bounded deposit',
      },
      password
    );
    console.log('✓ Deposit successful');
    console.log('Transaction Hash:', boundedDepositResult.hash);
  } catch (error) {
    console.log('✗ Deposit failed (price out of bounds)');
    console.error(error);
  }

  // Step 5: Example 3 - Withdrawal with minimum amounts
  console.log('\n=== Example 3: Withdrawal with Slippage Protection ===\n');

  const sharesToWithdraw = '10.0000000';

  // Estimate withdrawal
  const withdrawEstimate = await service.estimatePoolWithdraw(
    pool.id,
    sharesToWithdraw
  );

  console.log('Withdrawal Details:');
  console.log(`- Shares to withdraw: ${sharesToWithdraw}`);
  console.log(`- Expected Amount A: ${withdrawEstimate.amountA}`);
  console.log(`- Expected Amount B: ${withdrawEstimate.amountB}`);
  console.log(`- Price impact: ${withdrawEstimate.priceImpact}%`);

  // Calculate minimum amounts with 1% slippage
  const withdrawSlippage = '0.01';
  const { minAmountA: minWithdrawA, minAmountB: minWithdrawB } = calculateMinimumAmounts(
    withdrawEstimate.amountA,
    withdrawEstimate.amountB,
    withdrawSlippage
  );

  console.log(`\nSlippage Protection (${withdrawSlippage}):`);
  console.log(`- Min Amount A: ${minWithdrawA}`);
  console.log(`- Min Amount B: ${minWithdrawB}`);

  // Execute withdrawal with minimum amounts
  console.log('\nExecuting withdrawal with slippage protection...');
  try {
    const withdrawResult = await service.withdrawLiquidity(
      wallet,
      {
        poolId: pool.id,
        shares: sharesToWithdraw,
        minAmountA: minWithdrawA,
        minAmountB: minWithdrawB,
        memo: 'Protected withdrawal',
      },
      password
    );
    console.log('✓ Withdrawal successful');
    console.log('Transaction Hash:', withdrawResult.hash);
  } catch (error) {
    console.log('✗ Withdrawal failed (received amounts below minimum)');
    console.error(error);
  }

  // Step 6: Example 4 - Checking price impact before deposit
  console.log('\n=== Example 4: Pre-flight Price Impact Check ===\n');

  const testAmounts = [
    { a: '10.0000000', b: '50.0000000' },
    { a: '100.0000000', b: '500.0000000' },
    { a: '1000.0000000', b: '5000.0000000' },
  ];

  for (const amounts of testAmounts) {
    const willImpact = wouldImpactPrice(
      amounts.a,
      amounts.b,
      pool,
      '0.01' // 1% threshold
    );

    console.log(`Deposit ${amounts.a}/${amounts.b}:`);
    if (willImpact) {
      console.log('⚠️  Will impact price significantly (>1%)');
    } else {
      console.log('✓ Minimal price impact (<1%)');
    }
  }

  console.log('\n=== Slippage Protection Examples Complete ===');
}

// Run the example
main().catch(console.error);
