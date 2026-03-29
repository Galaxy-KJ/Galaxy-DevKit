/**
 * Example: Pool Analytics and Statistics
 *
 * This example demonstrates:
 * - Calculating pool metrics (TVL, share price)
 * - Analyzing price impact for deposits
 * - Calculating impermanent loss
 * - Monitoring user's pool positions
 * - Comparing multiple pools
 */

import {
  StellarService,
  NetworkConfig,
  Asset,
  calculateShareValue,
  calculateImpermanentLoss,
  formatPoolAssets,
  calculateSpotPrice,
} from '@galaxy/core-stellar-sdk';

// Network configuration
const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

async function main() {
  const service = new StellarService(networkConfig);

  // Example wallet public key (replace with actual)
  const userPublicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  console.log('=== Pool Analytics Dashboard ===\n');

  // Step 1: Get all user's pool positions
  console.log('Fetching your liquidity positions...');
  const userShares = await service.getAllUserPoolShares(userPublicKey);

  if (userShares.length === 0) {
    console.log('No liquidity positions found');
    return;
  }

  console.log(`Found ${userShares.length} pool position(s)\n`);

  // Step 2: Analyze each pool position
  for (const share of userShares) {
    console.log('-------------------------------------------');
    console.log(`Pool ID: ${share.poolId.substring(0, 16)}...`);

    // Get pool details
    const pool = await service.getLiquidityPool(share.poolId);
    const poolName = formatPoolAssets(pool);
    console.log(`Assets: ${poolName}`);
    console.log(`Your shares: ${share.balance}`);
    console.log(`Your pool ownership: ${share.percentage}%`);

    // Calculate share value
    const { valueA, valueB } = calculateShareValue(share.balance, pool);
    console.log(`\nShare Value:`);
    console.log(`- Asset A: ${valueA} ${pool.assetA.isNative() ? 'XLM' : pool.assetA.getCode()}`);
    console.log(`- Asset B: ${valueB} ${pool.assetB.isNative() ? 'XLM' : pool.assetB.getCode()}`);

    // Get pool analytics
    const analytics = await service.getPoolAnalytics(share.poolId);
    console.log(`\nPool Analytics:`);
    console.log(`- Total Value Locked: ${analytics.tvl}`);
    console.log(`- Share Price: ${analytics.sharePrice}`);

    // Calculate spot price
    const spotPrice = calculateSpotPrice(pool.reserveA, pool.reserveB);
    console.log(`\nCurrent Price:`);
    console.log(`- Spot Price: ${spotPrice} (Asset B per Asset A)`);

    // Demonstrate impermanent loss calculation
    // Example: If you entered when price was 5.0
    const initialPrice = '5.0000000';
    const currentPrice = spotPrice;
    const impermanentLoss = calculateImpermanentLoss(initialPrice, currentPrice);
    console.log(`\nImpermanent Loss Analysis:`);
    console.log(`- Initial Price: ${initialPrice}`);
    console.log(`- Current Price: ${currentPrice}`);
    console.log(`- Impermanent Loss: ${impermanentLoss}%`);
    console.log('');
  }

  // Step 3: Compare multiple pools
  console.log('=== Pool Comparison ===\n');

  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  const pools = await service.getPoolsForAssets(xlm, usdc, 5);
  console.log(`Found ${pools.length} XLM/USDC pools\n`);

  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const analytics = await service.getPoolAnalytics(pool.id);

    console.log(`Pool ${i + 1}:`);
    console.log(`- ID: ${pool.id.substring(0, 16)}...`);
    console.log(`- TVL: ${analytics.tvl}`);
    console.log(`- Share Price: ${analytics.sharePrice}`);
    console.log(`- Fee: ${pool.fee} basis points`);
    console.log(`- Total Shares: ${pool.totalShares}`);
    console.log(`- Trustlines: ${pool.totalTrustlines}`);
    console.log('');
  }

  // Step 4: Analyze deposit impact for different amounts
  console.log('=== Deposit Impact Analysis ===\n');

  if (pools.length > 0) {
    const examplePool = pools[0];
    const depositAmounts = [
      { a: '10.0000000', b: '50.0000000', label: 'Small' },
      { a: '100.0000000', b: '500.0000000', label: 'Medium' },
      { a: '1000.0000000', b: '5000.0000000', label: 'Large' },
    ];

    for (const deposit of depositAmounts) {
      const estimate = await service.estimatePoolDeposit(
        examplePool.id,
        deposit.a,
        deposit.b
      );

      console.log(`${deposit.label} Deposit (${deposit.a}/${deposit.b}):`);
      console.log(`- Expected shares: ${estimate.shares}`);
      console.log(`- Price impact: ${estimate.priceImpact}%`);
      console.log(`- Pool share after: ${estimate.poolShare}%`);
      console.log('');
    }
  }

  console.log('=== Analysis Complete ===');
}

// Run the example
main().catch(console.error);
