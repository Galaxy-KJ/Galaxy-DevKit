/**
 * @fileoverview Blend Protocol basic usage examples
 * @description Complete examples of using Blend protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { BlendProtocol } from '@galaxy-kj/core-defi-protocols';
import { Asset, ProtocolConfig } from '@galaxy-kj/core-defi-protocols';

/**
 * Example: Initialize Blend Protocol
 */
async function initializeBlend(): Promise<BlendProtocol> {
  const config: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol',
    network: {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      passphrase: 'Test SDF Network ; September 2015'
    },
    contractAddresses: {
      pool: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      oracle: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC5'
    },
    metadata: {
      version: '1.0.0',
      description: 'Blend lending protocol on Stellar testnet'
    }
  };

  const blend = new BlendProtocol(config);
  await blend.initialize();

  console.log('✅ Blend Protocol initialized');
  return blend;
}

/**
 * Example: Supply and withdraw workflow
 */
async function supplyWithdrawExample() {
  const blend = await initializeBlend();

  const userAddress = 'GUSER_ADDRESS_HERE';
  const userPrivateKey = 'SUSER_SECRET_KEY_HERE';

  const usdc: Asset = {
    code: 'USDC',
    issuer: 'GUSDC_ISSUER_ADDRESS',
    type: 'credit_alphanum4'
  };

  // Supply USDC
  console.log('💰 Supplying 1000 USDC...');
  const supplyResult = await blend.supply(
    userAddress,
    userPrivateKey,
    usdc,
    '1000'
  );
  console.log(`✅ Supply transaction: ${supplyResult.hash}`);

  // Check position after supply
  const position = await blend.getPosition(userAddress);
  console.log('📊 Position after supply:', {
    supplied: position.supplied.map(s => `${s.amount} ${s.asset.code}`),
    collateralValue: position.collateralValue
  });

  // Withdraw 500 USDC
  console.log('💸 Withdrawing 500 USDC...');
  const withdrawResult = await blend.withdraw(
    userAddress,
    userPrivateKey,
    usdc,
    '500'
  );
  console.log(`✅ Withdraw transaction: ${withdrawResult.hash}`);
}

/**
 * Example: Borrow and repay workflow
 */
async function borrowRepayExample() {
  const blend = await initializeBlend();

  const userAddress = 'GUSER_ADDRESS_HERE';
  const userPrivateKey = 'SUSER_SECRET_KEY_HERE';

  const xlm: Asset = {
    code: 'XLM',
    type: 'native'
  };

  // Borrow XLM
  console.log('🏦 Borrowing 100 XLM...');
  const borrowResult = await blend.borrow(
    userAddress,
    userPrivateKey,
    xlm,
    '100'
  );
  console.log(`✅ Borrow transaction: ${borrowResult.hash}`);

  // Check health factor
  const health = await blend.getHealthFactor(userAddress);
  console.log('🏥 Health Factor:', {
    value: health.value,
    isHealthy: health.isHealthy,
    liquidationThreshold: health.liquidationThreshold
  });

  // Repay 50 XLM
  console.log('💳 Repaying 50 XLM...');
  const repayResult = await blend.repay(
    userAddress,
    userPrivateKey,
    xlm,
    '50'
  );
  console.log(`✅ Repay transaction: ${repayResult.hash}`);
}

/**
 * Example: Monitor position health
 */
async function monitorHealthExample() {
  const blend = await initializeBlend();

  const userAddress = 'GUSER_ADDRESS_HERE';

  // Get full position
  const position = await blend.getPosition(userAddress);

  console.log('📊 Position Summary:');
  console.log('─────────────────────');
  console.log('Supplied Assets:');
  position.supplied.forEach(supply => {
    console.log(`  • ${supply.amount} ${supply.asset.code} ($${supply.valueUSD})`);
  });

  console.log('\nBorrowed Assets:');
  position.borrowed.forEach(borrow => {
    console.log(`  • ${borrow.amount} ${borrow.asset.code} ($${borrow.valueUSD})`);
  });

  console.log(`\nTotal Collateral: $${position.collateralValue}`);
  console.log(`Total Debt: $${position.debtValue}`);
  console.log(`Health Factor: ${position.healthFactor}`);

  // Check health factor
  const health = await blend.getHealthFactor(userAddress);

  if (!health.isHealthy) {
    console.log('\n⚠️  WARNING: Position is unhealthy!');
    console.log(`   Current health factor: ${health.value}`);
    console.log(`   Liquidation threshold: ${health.liquidationThreshold}`);
    console.log('   Action required: Add more collateral or repay debt');
  } else {
    console.log('\n✅ Position is healthy');
  }
}

/**
 * Example: Check APY rates
 */
async function checkAPYExample() {
  const blend = await initializeBlend();

  const assets: Asset[] = [
    { code: 'XLM', type: 'native' },
    { code: 'USDC', issuer: 'GUSDC_ISSUER', type: 'credit_alphanum4' },
    { code: 'BTC', issuer: 'GBTC_ISSUER', type: 'credit_alphanum4' }
  ];

  console.log('📈 Current APY Rates:');
  console.log('═════════════════════');

  for (const asset of assets) {
    const supplyAPY = await blend.getSupplyAPY(asset);
    const borrowAPY = await blend.getBorrowAPY(asset);

    console.log(`\n${asset.code}:`);
    console.log(`  Supply APY: ${supplyAPY.supplyAPY}%`);
    console.log(`  Borrow APY: ${borrowAPY.borrowAPY}%`);
  }
}

/**
 * Example: Liquidation bot
 */
async function liquidationBotExample() {
  const blend = await initializeBlend();

  const liquidatorAddress = 'GLIQUIDATOR_ADDRESS';
  const liquidatorKey = 'SLIQUIDATOR_SECRET_KEY';

  console.log('🤖 Starting liquidation bot...');

  // Find liquidation opportunities
  const opportunities = await blend.findLiquidationOpportunities(1.0);

  console.log(`Found ${opportunities.length} liquidation opportunities`);

  for (const opportunity of opportunities) {
    console.log('\n💰 Liquidation Opportunity:');
    console.log(`  User: ${opportunity.userAddress}`);
    console.log(`  Health Factor: ${opportunity.healthFactor}`);
    console.log(`  Collateral Value: $${opportunity.collateralValueUSD}`);
    console.log(`  Debt Value: $${opportunity.debtValueUSD}`);
    console.log(`  Estimated Profit: $${opportunity.estimatedProfitUSD}`);

    // Execute liquidation for first opportunity
    if (opportunity.debtAssets.length > 0 && opportunity.collateralAssets.length > 0) {
      const debtAsset = opportunity.debtAssets[0].asset;
      const debtAmount = opportunity.debtAssets[0].amount;
      const collateralAsset = opportunity.collateralAssets[0].asset;

      try {
        const result = await blend.liquidate(
          liquidatorAddress,
          liquidatorKey,
          opportunity.userAddress,
          debtAsset,
          debtAmount,
          collateralAsset
        );

        console.log(`\n✅ Liquidation successful!`);
        console.log(`  Transaction: ${result.txHash}`);
        console.log(`  Profit: $${result.profitUSD}`);
      } catch (error) {
        console.error(`❌ Liquidation failed:`, error);
      }
    }
  }
}

/**
 * Example: Get protocol statistics
 */
async function protocolStatsExample() {
  const blend = await initializeBlend();

  const stats = await blend.getStats();

  console.log('📊 Blend Protocol Statistics:');
  console.log('════════════════════════════');
  console.log(`Total Supply: $${stats.totalSupply}`);
  console.log(`Total Borrow: $${stats.totalBorrow}`);
  console.log(`Total Value Locked: $${stats.tvl}`);
  console.log(`Utilization Rate: ${stats.utilizationRate}%`);
  console.log(`Last Updated: ${stats.timestamp}`);
}

/**
 * Example: Complete lending workflow
 */
async function completeLendingWorkflow() {
  const blend = await initializeBlend();

  const userAddress = 'GUSER_ADDRESS';
  const userPrivateKey = 'SUSER_SECRET_KEY';

  const usdc: Asset = {
    code: 'USDC',
    issuer: 'GUSDC_ISSUER',
    type: 'credit_alphanum4'
  };

  const xlm: Asset = {
    code: 'XLM',
    type: 'native'
  };

  console.log('🎯 Complete Lending Workflow');
  console.log('═══════════════════════════\n');

  // Step 1: Check rates
  console.log('1️⃣ Checking current rates...');
  const usdcSupplyAPY = await blend.getSupplyAPY(usdc);
  const xlmBorrowAPY = await blend.getBorrowAPY(xlm);
  console.log(`   USDC Supply APY: ${usdcSupplyAPY.supplyAPY}%`);
  console.log(`   XLM Borrow APY: ${xlmBorrowAPY.borrowAPY}%\n`);

  // Step 2: Supply collateral
  console.log('2️⃣ Supplying 1000 USDC as collateral...');
  await blend.supply(userAddress, userPrivateKey, usdc, '1000');
  console.log('   ✅ Collateral supplied\n');

  // Step 3: Borrow against collateral
  console.log('3️⃣ Borrowing 100 XLM...');
  await blend.borrow(userAddress, userPrivateKey, xlm, '100');
  console.log('   ✅ Loan taken\n');

  // Step 4: Monitor position
  console.log('4️⃣ Checking position health...');
  const health = await blend.getHealthFactor(userAddress);
  console.log(`   Health Factor: ${health.value}`);
  console.log(`   Status: ${health.isHealthy ? '✅ Healthy' : '⚠️ At Risk'}\n`);

  // Step 5: Partial repayment
  console.log('5️⃣ Repaying 50 XLM...');
  await blend.repay(userAddress, userPrivateKey, xlm, '50');
  console.log('   ✅ Partial repayment complete\n');

  // Step 6: Final position
  console.log('6️⃣ Final position:');
  const finalPosition = await blend.getPosition(userAddress);
  console.log(`   Collateral: $${finalPosition.collateralValue}`);
  console.log(`   Debt: $${finalPosition.debtValue}`);
  console.log(`   Health Factor: ${finalPosition.healthFactor}`);

  console.log('\n✅ Workflow complete!');
}

// Export all examples
export {
  initializeBlend,
  supplyWithdrawExample,
  borrowRepayExample,
  monitorHealthExample,
  checkAPYExample,
  liquidationBotExample,
  protocolStatsExample,
  completeLendingWorkflow
};

// Run examples if executed directly
if (require.main === module) {
  (async () => {
    try {
      // Uncomment the example you want to run:
      // await supplyWithdrawExample();
      // await borrowRepayExample();
      // await monitorHealthExample();
      // await checkAPYExample();
      // await liquidationBotExample();
      // await protocolStatsExample();
      // await completeLendingWorkflow();
    } catch (error) {
      console.error('Error running example:', error);
      process.exit(1);
    }
  })();
}
