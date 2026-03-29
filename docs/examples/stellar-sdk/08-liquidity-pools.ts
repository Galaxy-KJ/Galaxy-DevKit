/**
 * Example: Liquidity Pool Operations
 *
 * This example demonstrates:
 * - Finding liquidity pools for specific asset pairs
 * - Depositing liquidity to a pool
 * - Checking user's pool shares
 * - Getting pool details and analytics
 * - Withdrawing liquidity from a pool
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
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

  // Step 1: Create/load wallet
  console.log('Creating wallet...');
  const wallet = await service.createWallet({}, password);
  console.log('Wallet:', wallet.publicKey);
  console.log('\nPlease fund wallet with XLM and USDC for liquidity provision');

  // Step 2: Define assets for the pool
  // Example: XLM/USDC pool
  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  // Step 3: Find pools for these assets
  console.log('\nFinding XLM/USDC liquidity pools...');
  const pools = await service.getPoolsForAssets(xlm, usdc, 5);

  if (pools.length === 0) {
    console.log('No pools found for this asset pair');
    return;
  }

  const pool = pools[0];
  console.log('Found pool:', pool.id);
  console.log('Reserve A:', pool.reserveA, pool.assetA.isNative() ? 'XLM' : pool.assetA.getCode());
  console.log('Reserve B:', pool.reserveB, pool.assetB.isNative() ? 'XLM' : pool.assetB.getCode());
  console.log('Total Shares:', pool.totalShares);
  console.log('Fee:', pool.fee, 'basis points');

  // Step 4: Estimate deposit before executing
  console.log('\nEstimating deposit...');
  const depositEstimate = await service.estimatePoolDeposit(
    pool.id,
    '100.0000000', // 100 XLM
    '50.0000000'   // 50 USDC
  );
  console.log('Expected shares:', depositEstimate.shares);
  console.log('Actual amount A:', depositEstimate.actualAmountA);
  console.log('Actual amount B:', depositEstimate.actualAmountB);
  console.log('Price impact:', depositEstimate.priceImpact, '%');
  console.log('Pool share:', depositEstimate.poolShare, '%');

  // Step 5: Deposit liquidity to the pool
  console.log('\nDepositing liquidity...');
  const depositResult = await service.depositLiquidity(
    wallet,
    {
      poolId: pool.id,
      maxAmountA: '100.0000000',
      maxAmountB: '50.0000000',
      slippageTolerance: '0.01', // 1% slippage tolerance
      memo: 'LP deposit',
    },
    password
  );

  console.log('Liquidity deposited!');
  console.log('Transaction Hash:', depositResult.hash);
  console.log('Status:', depositResult.status);
  console.log('Ledger:', depositResult.ledger);

  // Step 6: Check user's shares in this pool
  console.log('\nChecking pool shares...');
  const userShares = await service.getLiquidityPoolShares(wallet.publicKey, pool.id);
  console.log('Your shares:', userShares);

  // Step 7: Get all pool shares for user
  console.log('\nGetting all pool positions...');
  const allShares = await service.getAllUserPoolShares(wallet.publicKey);
  allShares.forEach((share, index) => {
    console.log(`\nPool ${index + 1}:`);
    console.log('Pool ID:', share.poolId);
    console.log('Balance:', share.balance);
    console.log('Percentage:', share.percentage, '%');
  });

  // Step 8: Get pool analytics
  console.log('\nGetting pool analytics...');
  const analytics = await service.getPoolAnalytics(pool.id);
  console.log('TVL:', analytics.tvl);
  console.log('Share Price:', analytics.sharePrice);
  if (analytics.volume24h) console.log('24h Volume:', analytics.volume24h);
  if (analytics.fees24h) console.log('24h Fees:', analytics.fees24h);
  if (analytics.apy) console.log('APY:', analytics.apy, '%');

  // Step 9: Estimate withdrawal
  console.log('\nEstimating withdrawal...');
  const withdrawEstimate = await service.estimatePoolWithdraw(
    pool.id,
    '10.0000000' // Withdraw 10 shares
  );
  console.log('Expected amount A:', withdrawEstimate.amountA);
  console.log('Expected amount B:', withdrawEstimate.amountB);
  console.log('Share price:', withdrawEstimate.sharePrice);
  console.log('Price impact:', withdrawEstimate.priceImpact, '%');

  // Step 10: Withdraw liquidity from pool
  console.log('\nWithdrawing liquidity...');
  const withdrawResult = await service.withdrawLiquidity(
    wallet,
    {
      poolId: pool.id,
      shares: '10.0000000',
      slippageTolerance: '0.01', // 1% slippage tolerance
      memo: 'LP withdrawal',
    },
    password
  );

  console.log('Liquidity withdrawn!');
  console.log('Transaction Hash:', withdrawResult.hash);
  console.log('Status:', withdrawResult.status);
  console.log('Ledger:', withdrawResult.ledger);

  // Step 11: Check updated shares
  console.log('\nChecking updated shares...');
  const updatedShares = await service.getLiquidityPoolShares(wallet.publicKey, pool.id);
  console.log('Remaining shares:', updatedShares);
}

// Run the example
main().catch(console.error);
