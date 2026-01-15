/**
 * @fileoverview Lending Operations Example
 * @description Demonstrates supply, borrow, repay, and withdraw operations
 */

import {
  getProtocolFactory,
  ProtocolConfig,
  TESTNET_CONFIG,
  IDefiProtocol,
  Asset,
  AssetType
} from '@galaxy/core-defi-protocols';

// Test wallet credentials (DO NOT use in production!)
const TEST_WALLET_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const TEST_PRIVATE_KEY = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// Asset definitions
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GAUSDC_ISSUER_ADDRESS_ON_TESTNET',
  type: AssetType.CREDIT_ALPHANUM4
};

const XLM: Asset = {
  code: 'XLM',
  type: AssetType.NATIVE
};

/**
 * Example 1: Supply assets to earn interest
 */
async function supplyAssets(protocol: IDefiProtocol) {
  console.log('=== Supply Assets ===\n');

  try {
    // Supply 1000 USDC to the protocol
    console.log('Supplying 1000 USDC...');
    const result = await protocol.supply(
      TEST_WALLET_ADDRESS,
      TEST_PRIVATE_KEY,
      USDC,
      '1000.00'
    );

    console.log('✅ Supply successful!');
    console.log('  - Transaction Hash:', result.hash);
    console.log('  - Status:', result.status);
    console.log('  - Ledger:', result.ledger);
    console.log('  - Timestamp:', result.createdAt.toISOString());

    // Check current supply APY
    const apy = await protocol.getSupplyAPY(USDC);
    console.log('\nCurrent USDC Supply APY:');
    console.log('  - Supply APY:', apy.supplyAPY, '%');
    if (apy.rewardAPY) {
      console.log('  - Reward APY:', apy.rewardAPY, '%');
    }
    console.log('  - Last Updated:', apy.timestamp.toISOString());

  } catch (error) {
    console.error('❌ Supply failed:', error);
    throw error;
  }
}

/**
 * Example 2: Borrow assets against collateral
 */
async function borrowAssets(protocol: IDefiProtocol) {
  console.log('\n\n=== Borrow Assets ===\n');

  try {
    // First, check if we have sufficient collateral
    const position = await protocol.getPosition(TEST_WALLET_ADDRESS);
    console.log('Current Position:');
    console.log('  - Collateral Value:', position.collateralValue, 'USD');
    console.log('  - Debt Value:', position.debtValue, 'USD');
    console.log('  - Health Factor:', position.healthFactor);

    if (parseFloat(position.healthFactor) < 1.5) {
      console.warn('⚠️  Warning: Health factor is low. Consider supplying more collateral.');
    }

    // Borrow 500 XLM
    console.log('\nBorrowing 500 XLM...');
    const result = await protocol.borrow(
      TEST_WALLET_ADDRESS,
      TEST_PRIVATE_KEY,
      XLM,
      '500.00'
    );

    console.log('✅ Borrow successful!');
    console.log('  - Transaction Hash:', result.hash);
    console.log('  - Status:', result.status);
    console.log('  - Amount Borrowed: 500 XLM');

    // Check updated position
    const updatedPosition = await protocol.getPosition(TEST_WALLET_ADDRESS);
    console.log('\nUpdated Position:');
    console.log('  - Collateral Value:', updatedPosition.collateralValue, 'USD');
    console.log('  - Debt Value:', updatedPosition.debtValue, 'USD');
    console.log('  - Health Factor:', updatedPosition.healthFactor);

    // Check borrow APY
    const apy = await protocol.getBorrowAPY(XLM);
    console.log('\nCurrent XLM Borrow APY:', apy.borrowAPY, '%');

  } catch (error) {
    console.error('❌ Borrow failed:', error);
    throw error;
  }
}

/**
 * Example 3: Repay borrowed assets
 */
async function repayAssets(protocol: IDefiProtocol) {
  console.log('\n\n=== Repay Borrowed Assets ===\n');

  try {
    // Check current debt
    const position = await protocol.getPosition(TEST_WALLET_ADDRESS);
    const xlmDebt = position.borrowed.find(b => b.asset.code === 'XLM');

    if (!xlmDebt || parseFloat(xlmDebt.amount) === 0) {
      console.log('No XLM debt to repay.');
      return;
    }

    console.log('Current XLM Debt:');
    console.log('  - Amount:', xlmDebt.amount, 'XLM');
    console.log('  - Value:', xlmDebt.valueUSD, 'USD');

    // Repay 250 XLM (partial repayment)
    console.log('\nRepaying 250 XLM...');
    const result = await protocol.repay(
      TEST_WALLET_ADDRESS,
      TEST_PRIVATE_KEY,
      XLM,
      '250.00'
    );

    console.log('✅ Repayment successful!');
    console.log('  - Transaction Hash:', result.hash);
    console.log('  - Status:', result.status);
    console.log('  - Amount Repaid: 250 XLM');

    // Check updated position
    const updatedPosition = await protocol.getPosition(TEST_WALLET_ADDRESS);
    const updatedDebt = updatedPosition.borrowed.find(b => b.asset.code === 'XLM');

    console.log('\nRemaining XLM Debt:', updatedDebt?.amount || '0', 'XLM');
    console.log('Health Factor:', updatedPosition.healthFactor);

  } catch (error) {
    console.error('❌ Repay failed:', error);
    throw error;
  }
}

/**
 * Example 4: Withdraw supplied assets
 */
async function withdrawAssets(protocol: IDefiProtocol) {
  console.log('\n\n=== Withdraw Supplied Assets ===\n');

  try {
    // Check current supply
    const position = await protocol.getPosition(TEST_WALLET_ADDRESS);
    const usdcSupply = position.supplied.find(s => s.asset.code === 'USDC');

    if (!usdcSupply || parseFloat(usdcSupply.amount) === 0) {
      console.log('No USDC supply to withdraw.');
      return;
    }

    console.log('Current USDC Supply:');
    console.log('  - Amount:', usdcSupply.amount, 'USDC');
    console.log('  - Value:', usdcSupply.valueUSD, 'USD');

    // Check if withdrawal is safe (won't drop health factor below 1)
    const healthFactor = await protocol.getHealthFactor(TEST_WALLET_ADDRESS);
    console.log('\nCurrent Health Factor:', healthFactor.value);

    if (parseFloat(healthFactor.value) < 1.3) {
      console.warn('⚠️  Warning: Health factor is low. Withdrawal may be risky.');
    }

    // Withdraw 500 USDC (partial withdrawal)
    console.log('\nWithdrawing 500 USDC...');
    const result = await protocol.withdraw(
      TEST_WALLET_ADDRESS,
      TEST_PRIVATE_KEY,
      USDC,
      '500.00'
    );

    console.log('✅ Withdrawal successful!');
    console.log('  - Transaction Hash:', result.hash);
    console.log('  - Status:', result.status);
    console.log('  - Amount Withdrawn: 500 USDC');

    // Check updated position
    const updatedPosition = await protocol.getPosition(TEST_WALLET_ADDRESS);
    const updatedSupply = updatedPosition.supplied.find(s => s.asset.code === 'USDC');

    console.log('\nRemaining USDC Supply:', updatedSupply?.amount || '0', 'USDC');
    console.log('Health Factor:', updatedPosition.healthFactor);

  } catch (error) {
    console.error('❌ Withdrawal failed:', error);
    throw error;
  }
}

/**
 * Example 5: Complete lending cycle
 */
async function completeLendingCycle() {
  console.log('=== Complete Lending Cycle ===\n');

  // Create and initialize protocol
  const factory = getProtocolFactory();
  const config: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol',
    network: TESTNET_CONFIG,
    contractAddresses: {
      pool: 'CBLEND_POOL_ADDRESS'
    },
    metadata: {}
  };

  const protocol = factory.createProtocol(config);
  await protocol.initialize();

  console.log('Protocol initialized:', protocol.name);
  console.log('Network:', protocol.config.network.network);

  try {
    // Step 1: Supply assets as collateral
    console.log('\n📥 Step 1: Supply collateral');
    await supplyAssets(protocol);

    // Wait a bit to let the transaction settle
    console.log('\nWaiting for transaction to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 2: Borrow against collateral
    console.log('\n💰 Step 2: Borrow assets');
    await borrowAssets(protocol);

    // Wait a bit
    console.log('\nWaiting for transaction to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Repay borrowed assets
    console.log('\n💸 Step 3: Repay debt');
    await repayAssets(protocol);

    // Wait a bit
    console.log('\nWaiting for transaction to settle...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 4: Withdraw supplied assets
    console.log('\n📤 Step 4: Withdraw supply');
    await withdrawAssets(protocol);

    // Final position check
    console.log('\n\n=== Final Position ===');
    const finalPosition = await protocol.getPosition(TEST_WALLET_ADDRESS);
    console.log('Collateral Value:', finalPosition.collateralValue, 'USD');
    console.log('Debt Value:', finalPosition.debtValue, 'USD');
    console.log('Health Factor:', finalPosition.healthFactor);

  } catch (error) {
    console.error('❌ Lending cycle failed:', error);
    throw error;
  }
}

/**
 * Run all examples
 */
async function main() {
  console.log('🚀 DeFi Protocols - Lending Operations Examples\n');
  console.log('='.repeat(50));
  console.log('\n⚠️  WARNING: These examples use testnet. Never use real private keys in code!\n');
  console.log('='.repeat(50));

  try {
    await completeLendingCycle();

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ All lending operations completed successfully!');
    console.log('\n💡 Tips:');
    console.log('  - Always check health factor before borrowing');
    console.log('  - Monitor APY rates for optimal returns');
    console.log('  - Keep health factor above 1.5 for safety');
    console.log('  - Repay regularly to avoid liquidation');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export {
  supplyAssets,
  borrowAssets,
  repayAssets,
  withdrawAssets,
  completeLendingCycle
};
