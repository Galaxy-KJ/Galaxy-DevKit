/**
 * @fileoverview Soroswap Protocol basic usage examples
 * @description Complete examples of using Soroswap protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { SoroswapProtocol } from '../soroswap-protocol.js';
import { Asset, ProtocolConfig } from '../../../types/defi-types.js';
import { SOROSWAP_TESTNET_CONFIG } from '../soroswap-config.js';
import { calculateSoroswapPoolAnalytics } from '../analytics.js';

/**
 * Example: Initialize Soroswap Protocol
 */
async function initializeSoroswap(): Promise<SoroswapProtocol> {
  const soroswap = new SoroswapProtocol(SOROSWAP_TESTNET_CONFIG);
  await soroswap.initialize();

  console.log('Soroswap Protocol initialized');
  console.log(`Protocol ID: ${soroswap.protocolId}`);
  console.log(`Protocol Type: ${soroswap.type}`);
  return soroswap;
}

/**
 * Example: Get protocol statistics
 */
async function protocolStatsExample(): Promise<void> {
  const soroswap = await initializeSoroswap();

  const stats = await soroswap.getStats();

  console.log('Soroswap Protocol Statistics:');
  console.log(`Total Value Locked: $${stats.tvl}`);
  console.log(`Last Updated: ${stats.timestamp}`);
}

/**
 * Example: Get pair information
 */
async function getPairInfoExample(): Promise<void> {
  const soroswap = await initializeSoroswap();

  // Query pair info using token contract addresses
  const tokenA = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'; // XLM
  const tokenB = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU'; // USDC

  const pairInfo = await soroswap.getPairInfo(tokenA, tokenB);

  console.log('Pair Information:');
  console.log(`Pair Address: ${pairInfo.pairAddress}`);
  console.log(`Reserve 0: ${pairInfo.reserve0}`);
  console.log(`Reserve 1: ${pairInfo.reserve1}`);
  console.log(`Total LP Supply: ${pairInfo.totalSupply}`);
  console.log(`Fee: ${pairInfo.fee}`);
}

/**
 * Example: Get all pairs
 */
async function getAllPairsExample(): Promise<void> {
  const soroswap = await initializeSoroswap();

  const pairs = await soroswap.getAllPairs();

  console.log(`Total registered pairs: ${pairs.length}`);
  pairs.forEach((pairAddress, index) => {
    console.log(`  ${index + 1}. ${pairAddress}`);
  });
}

/**
 * Example: Derive pool analytics with price and volume inputs
 */
async function poolAnalyticsExample(): Promise<void> {
  const soroswap = await initializeSoroswap();

  const analytics = await soroswap.getPoolAnalytics(
    'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
    {
      token0PriceUsd: 0.11,
      token1PriceUsd: 1,
      volume24hUsd: 25000,
      volume7dUsd: 150000,
      lpPosition: {
        lpTokenAmount: '5000000',
        initialPriceRatio: 9,
      },
    }
  );

  console.log('Pool Analytics:');
  console.log(`TVL (USD): ${analytics.tvlUsd.toFixed(2)}`);
  console.log(`24h Volume (USD): ${analytics.volume24hUsd.toFixed(2)}`);
  console.log(`24h Fees (USD): ${analytics.fees24hUsd.toFixed(2)}`);
  console.log(`Fee APR: ${(analytics.feeApr * 100).toFixed(2)}%`);
  console.log(`Impermanent Loss: ${analytics.lpPosition?.impermanentLossPct.toFixed(2) ?? '0.00'}%`);

  const localAnalytics = calculateSoroswapPoolAnalytics({
    poolAddress: analytics.poolAddress,
    token0: analytics.token0,
    token1: analytics.token1,
    reserve0: analytics.reserve0,
    reserve1: analytics.reserve1,
    totalSupply: analytics.totalSupply,
    options: {
      token0PriceUsd: 0.11,
      token1PriceUsd: 1,
      volume24hUsd: 25000,
    },
  });

  console.log(`Local APR check: ${(localAnalytics.feeApr * 100).toFixed(2)}%`);
}

/**
 * Example: Create via factory
 */
async function factoryExample(): Promise<void> {
  // Import registers Soroswap with the factory automatically
  await import('../soroswap-registration.js');

  const { getProtocolFactory } = await import('../../../services/protocol-factory.js');
  const factory = getProtocolFactory();

  console.log('Supported protocols:', factory.getSupportedProtocols());

  // Create Soroswap instance via factory
  const soroswap = factory.createProtocol(SOROSWAP_TESTNET_CONFIG);
  await soroswap.initialize();

  console.log(`Created ${soroswap.name} via factory`);
  console.log(`Protocol type: ${soroswap.type}`);
}

// Export all examples
export {
  initializeSoroswap,
  protocolStatsExample,
  getPairInfoExample,
  getAllPairsExample,
  poolAnalyticsExample,
  factoryExample
};

// Run examples if executed directly
if (require.main === module) {
  (async () => {
    try {
      // Uncomment the example you want to run:
      // await protocolStatsExample();
      // await getPairInfoExample();
      // await getAllPairsExample();
      // await poolAnalyticsExample();
      // await factoryExample();
    } catch (error) {
      console.error('Error running example:', error);
      process.exit(1);
    }
  })();
}
