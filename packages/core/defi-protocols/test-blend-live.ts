/**
 * Live Blend Transaction Test
 * Run with: npx tsx test-blend-live.ts
 */

import { Keypair } from '@stellar/stellar-sdk';
import { BlendProtocol } from './src/protocols/blend/blend-protocol.js';
import { Asset } from './src/types/defi-types.js';

const TESTNET_CONFIG = {
  protocolId: 'blend',
  name: 'Blend Protocol Testnet',
  network: {
    network: 'testnet' as const,
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  },
  contractAddresses: {
    pool: 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
    oracle: 'CAZOKR2Y5E2OSWSIBRVZMJ47RUTQPIGVWSAQ2UISGAVC46XKPGDG5PKI',
    backstop: 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',
    emitter: 'CC3WJVJINN4E3LPMNTWKK7LQZLYDQMZHZA7EZGXATPHHBPKNZRIO3KZ6'
  },
  metadata: {}
};

const XLM: Asset = { code: 'XLM', type: 'native' };

// USDC on Stellar testnet (Soroban contract)
const USDC_CONTRACT = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  type: 'credit_alphanum4'
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       BLEND PROTOCOL - LIVE TESTNET TRANSACTION TEST         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Create wallet
  const wallet = Keypair.random();
  const address = wallet.publicKey();
  const secret = wallet.secret();

  console.log('🔑 Test Wallet Created:');
  console.log(`   Address: ${address}`);
  console.log(`   Secret:  ${secret}\n`);

  // Fund account
  console.log('💰 Funding account with Friendbot...');
  try {
    const fundResponse = await fetch(`https://friendbot.stellar.org?addr=${address}`);
    if (!fundResponse.ok) {
      throw new Error('Failed to fund account');
    }
    console.log('✅ Account funded with 10,000 XLM\n');
    await sleep(5000);
  } catch (error) {
    console.error('❌ Failed to fund account:', error);
    return;
  }

  // Initialize Blend
  console.log('🚀 Initializing Blend Protocol...');
  try {
    const blend = new BlendProtocol(TESTNET_CONFIG);
    await blend.initialize();
    console.log('✅ Blend initialized\n');

    // Test 1: Check initial position
    console.log('📊 Test 1: Check Initial Position');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      const position = await blend.getPosition(address);
      console.log(`✅ Position retrieved`);
      console.log(`   Supplied: ${position.supplied.length} assets`);
      console.log(`   Borrowed: ${position.borrowed.length} assets`);
      console.log(`   Collateral: $${position.collateralValue}`);
      console.log(`   Debt: $${position.debtValue}\n`);
    } catch (error: any) {
      console.log(`⚠️  No position yet: ${error.message}\n`);
    }

    // Test 2: Supply transaction with XLM Native
    console.log('💰 Test 2: Submit Supply Transaction (XLM Native)');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      console.log('   Submitting supply of 100 XLM (1,000,000,000 stroops)...');
      console.log('   Using XLM contract: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC');
      const result = await blend.supply(address, secret, XLM, '1000000000');

      console.log('\n✅ TRANSACTION SUBMITTED SUCCESSFULLY!');
      console.log('   ╔════════════════════════════════════════════════════════════╗');
      console.log(`   ║ HASH: ${result.hash}         ║`);
      console.log('   ╚════════════════════════════════════════════════════════════╝');
      console.log(`   Status: ${result.status}`);
      console.log(`   Ledger: ${result.ledger}`);
      console.log('\n   🔗 View on Stellar Expert:');
      console.log(`   https://stellar.expert/explorer/testnet/tx/${result.hash}`);
      console.log('\n   🔗 View on Blend UI:');
      console.log(`   https://testnet.blend.capital/\n`);
    } catch (error: any) {
      console.log(`\n⚠️  Supply transaction failed:`);
      console.log(`   ${error.message}`);
      console.log(`   Stack: ${error.stack}\n`);
      console.log('   Common reasons:');
      console.log('   - Pool contract not initialized for this asset');
      console.log('   - Trustline requirements not met');
      console.log('   - Contract authorization needed');
      console.log('   - Soroban RPC connection issues\n');
    }

    // Test 3: Get protocol stats
    console.log('📈 Test 3: Get Protocol Stats');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      const stats = await blend.getStats();
      console.log('✅ Protocol Stats:');
      console.log(`   Total Supply: ${stats.totalSupply}`);
      console.log(`   Total Borrow: ${stats.totalBorrow}`);
      console.log(`   TVL: $${stats.tvl}`);
      console.log(`   Utilization: ${stats.utilizationRate}%\n`);
    } catch (error: any) {
      console.log(`⚠️  ${error.message}\n`);
    }

    // Test 4: Check health factor
    console.log('🏥 Test 4: Calculate Health Factor');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      const health = await blend.getHealthFactor(address);
      console.log('✅ Health Factor:');
      console.log(`   Value: ${health.value}`);
      console.log(`   Liquidation Threshold: ${health.liquidationThreshold}`);
      console.log(`   Status: ${health.isHealthy ? '✅ Healthy' : '⚠️  At Risk'}\n`);
    } catch (error: any) {
      console.log(`⚠️  ${error.message}\n`);
    }

    // Test 5: Check APY rates
    console.log('💹 Test 5: Check APY Rates for XLM');
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      const apyInfo = await blend.getSupplyAPY(XLM);
      console.log('✅ APY Information:');
      console.log(`   Supply APY: ${apyInfo.supplyAPY}%`);
      console.log(`   Borrow APY: ${apyInfo.borrowAPY}%\n`);
    } catch (error: any) {
      console.log(`⚠️  ${error.message}\n`);
    }

    // Summary
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     TEST COMPLETE                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log('✅ Verification Links:');
    console.log(`   Account: https://stellar.expert/explorer/testnet/account/${address}`);
    console.log(`   Blend UI: https://testnet.blend.capital/\n`);
    console.log('📝 Note: Transaction hashes above can be verified on Stellar Expert');
    console.log('   to confirm the Blend Protocol integration is working correctly!\n');

  } catch (error: any) {
    console.error('\n❌ Blend initialization error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

run().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
