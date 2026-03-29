/**
 * Live Blend Transaction Test
 * Run with: node test-blend-live.js
 */

const { Keypair } = require('@stellar/stellar-sdk');
const { BlendProtocol } = require('./dist/protocols/blend/blend-protocol.js');

const TESTNET_CONFIG = {
  protocolId: 'blend',
  name: 'Blend Protocol Testnet',
  network: {
    network: 'testnet',
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

const XLM = { code: 'XLM', type: 'native' };

async function sleep(ms) {
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
  const fundResponse = await fetch(`https://friendbot.stellar.org?addr=${address}`);
  if (!fundResponse.ok) {
    throw new Error('Failed to fund account');
  }
  console.log('✅ Account funded\n');
  await sleep(5000);

  // Initialize Blend
  console.log('🚀 Initializing Blend Protocol...');
  const blend = new BlendProtocol(TESTNET_CONFIG);
  await blend.initialize();
  console.log('✅ Blend initialized\n');

  // Test 1: Check position
  console.log('📊 Test 1: Check Initial Position');
  console.log('═══════════════════════════════════════════════════════════════');
  try {
    const position = await blend.getPosition(address);
    console.log(`✅ Position retrieved`);
    console.log(`   Supplied: ${position.supplied.length} assets`);
    console.log(`   Borrowed: ${position.borrowed.length} assets`);
    console.log(`   Collateral: $${position.collateralValue}`);
    console.log(`   Debt: $${position.debtValue}\n`);
  } catch (error) {
    console.log(`⚠️  No position yet: ${error.message}\n`);
  }

  // Test 2: Supply transaction
  console.log('💰 Test 2: Submit Supply Transaction');
  console.log('═══════════════════════════════════════════════════════════════');
  try {
    console.log('   Submitting supply of 100 XLM...');
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
  } catch (error) {
    console.log(`\n⚠️  Supply transaction failed:`);
    console.log(`   ${error.message}`);
    console.log('\n   Common reasons:');
    console.log('   - Pool not initialized for this asset');
    console.log('   - Trustline requirements');
    console.log('   - Contract authorization needed\n');
  }

  // Test 3: Check protocol stats
  console.log('📈 Test 3: Get Protocol Stats');
  console.log('═══════════════════════════════════════════════════════════════');
  try {
    const stats = await blend.getStats();
    console.log('✅ Protocol Stats:');
    console.log(`   Total Supply: ${stats.totalSupply}`);
    console.log(`   Total Borrow: ${stats.totalBorrow}`);
    console.log(`   TVL: $${stats.tvl}\n`);
  } catch (error) {
    console.log(`⚠️  ${error.message}\n`);
  }

  // Test 4: Health factor
  console.log('🏥 Test 4: Calculate Health Factor');
  console.log('═══════════════════════════════════════════════════════════════');
  try {
    const health = await blend.getHealthFactor(address);
    console.log('✅ Health Factor:');
    console.log(`   Value: ${health.value}`);
    console.log(`   Status: ${health.isHealthy ? '✅ Healthy' : '⚠️  At Risk'}\n`);
  } catch (error) {
    console.log(`⚠️  ${error.message}\n`);
  }

  // Summary
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     TEST COMPLETE                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Verification:');
  console.log(`   Account: https://stellar.expert/explorer/testnet/account/${address}`);
  console.log(`   Blend UI: https://testnet.blend.capital/\n`);
  console.log('📝 Note: Transaction hashes above can be verified on Stellar Expert');
  console.log('   to confirm the Blend Protocol integration is working correctly!\n');
}

run().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
