/**
 * @fileoverview Basic DeFi Protocol Setup Example
 * @description Demonstrates how to initialize and configure a DeFi protocol
 */

import {
  getProtocolFactory,
  ProtocolConfig,
  TESTNET_CONFIG,
  IDefiProtocol
} from '@galaxy/core-defi-protocols';

/**
 * Example 1: Basic protocol setup and initialization
 */
async function basicSetup() {
  console.log('=== Basic Protocol Setup ===\n');

  // Step 1: Create protocol configuration
  const config: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol',
    network: TESTNET_CONFIG,
    contractAddresses: {
      pool: 'CBLEND_POOL_CONTRACT_ADDRESS_ON_TESTNET',
      oracle: 'CBLEND_ORACLE_CONTRACT_ADDRESS'
    },
    metadata: {
      version: '1.0.0',
      description: 'Blend lending protocol on Stellar testnet'
    }
  };

  // Step 2: Get protocol factory instance (singleton)
  const factory = getProtocolFactory();

  console.log('Supported protocols:', factory.getSupportedProtocols());

  // Step 3: Create protocol instance
  // Note: In real implementation, you would need to register the protocol first:
  // factory.register('blend', BlendProtocol);

  try {
    const protocol: IDefiProtocol = factory.createProtocol(config);

    console.log('Protocol created:');
    console.log('  - ID:', protocol.protocolId);
    console.log('  - Name:', protocol.name);
    console.log('  - Type:', protocol.type);
    console.log('  - Initialized:', protocol.isInitialized());

    // Step 4: Initialize the protocol
    console.log('\nInitializing protocol...');
    await protocol.initialize();

    console.log('Protocol initialized successfully!');
    console.log('  - Network:', protocol.config.network.network);
    console.log('  - Horizon URL:', protocol.config.network.horizonUrl);
    console.log('  - Soroban RPC:', protocol.config.network.sorobanRpcUrl);

    // Step 5: Get protocol statistics
    const stats = await protocol.getStats();
    console.log('\nProtocol Statistics:');
    console.log('  - Total Supply:', stats.totalSupply, 'USD');
    console.log('  - Total Borrow:', stats.totalBorrow, 'USD');
    console.log('  - TVL:', stats.tvl, 'USD');
    console.log('  - Utilization Rate:', stats.utilizationRate, '%');

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Working with multiple protocols
 */
async function multipleProtocols() {
  console.log('\n\n=== Working with Multiple Protocols ===\n');

  const factory = getProtocolFactory();

  // Configure Blend Protocol
  const blendConfig: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol',
    network: TESTNET_CONFIG,
    contractAddresses: {
      pool: 'CBLEND_POOL_ADDRESS'
    },
    metadata: {}
  };

  // Configure Soroswap Protocol
  const soroswapConfig: ProtocolConfig = {
    protocolId: 'soroswap',
    name: 'Soroswap',
    network: TESTNET_CONFIG,
    contractAddresses: {
      router: 'CSOROSWAP_ROUTER_ADDRESS',
      factory: 'CSOROSWAP_FACTORY_ADDRESS'
    },
    metadata: {}
  };

  try {
    // Create both protocol instances
    const blend = factory.createProtocol(blendConfig);
    const soroswap = factory.createProtocol(soroswapConfig);

    // Initialize both
    await Promise.all([
      blend.initialize(),
      soroswap.initialize()
    ]);

    console.log('Both protocols initialized:');
    console.log('  - Blend:', blend.name, '(', blend.type, ')');
    console.log('  - Soroswap:', soroswap.name, '(', soroswap.type, ')');

  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Network configuration (testnet vs mainnet)
 */
async function networkConfiguration() {
  console.log('\n\n=== Network Configuration ===\n');

  const factory = getProtocolFactory();

  // Testnet configuration
  const testnetConfig: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol (Testnet)',
    network: TESTNET_CONFIG,
    contractAddresses: {
      pool: 'CBLEND_TESTNET_ADDRESS'
    },
    metadata: {}
  };

  // Mainnet configuration
  const mainnetConfig: ProtocolConfig = {
    protocolId: 'blend',
    name: 'Blend Protocol (Mainnet)',
    network: {
      network: 'mainnet',
      horizonUrl: 'https://horizon.stellar.org',
      sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
      passphrase: 'Public Global Stellar Network ; September 2015'
    },
    contractAddresses: {
      pool: 'CBLEND_MAINNET_ADDRESS'
    },
    metadata: {}
  };

  console.log('Testnet Configuration:');
  console.log('  - Network:', testnetConfig.network.network);
  console.log('  - Horizon:', testnetConfig.network.horizonUrl);
  console.log('  - Soroban RPC:', testnetConfig.network.sorobanRpcUrl);

  console.log('\nMainnet Configuration:');
  console.log('  - Network:', mainnetConfig.network.network);
  console.log('  - Horizon:', mainnetConfig.network.horizonUrl);
  console.log('  - Soroban RPC:', mainnetConfig.network.sorobanRpcUrl);

  console.log('\n⚠️  Always test on testnet before using mainnet!');
}

/**
 * Example 4: Error handling
 */
async function errorHandling() {
  console.log('\n\n=== Error Handling ===\n');

  const factory = getProtocolFactory();

  // Example 1: Invalid protocol ID
  try {
    const invalidConfig: ProtocolConfig = {
      protocolId: 'non-existent-protocol',
      name: 'Invalid Protocol',
      network: TESTNET_CONFIG,
      contractAddresses: {},
      metadata: {}
    };

    factory.createProtocol(invalidConfig);
  } catch (error) {
    console.log('Error caught (invalid protocol):');
    console.log('  -', (error as Error).message);
  }

  // Example 2: Missing contract addresses
  try {
    const invalidConfig: ProtocolConfig = {
      protocolId: 'blend',
      name: 'Blend Protocol',
      network: TESTNET_CONFIG,
      contractAddresses: {}, // Empty - will fail validation
      metadata: {}
    };

    const protocol = factory.createProtocol(invalidConfig);
    await protocol.initialize(); // Will fail here
  } catch (error) {
    console.log('\nError caught (missing contracts):');
    console.log('  -', (error as Error).message);
  }

  // Example 3: Invalid network URL
  try {
    const invalidConfig: ProtocolConfig = {
      protocolId: 'blend',
      name: 'Blend Protocol',
      network: {
        network: 'testnet',
        horizonUrl: 'https://invalid-horizon-url.com',
        sorobanRpcUrl: 'https://invalid-soroban-url.com',
        passphrase: 'Test SDF Network ; September 2015'
      },
      contractAddresses: {
        pool: 'CTEST123'
      },
      metadata: {}
    };

    const protocol = factory.createProtocol(invalidConfig);
    await protocol.initialize(); // Will fail on network check
  } catch (error) {
    console.log('\nError caught (invalid network):');
    console.log('  -', (error as Error).message);
  }
}

/**
 * Run all examples
 */
async function main() {
  console.log('🚀 DeFi Protocols - Basic Setup Examples\n');
  console.log('='.repeat(50));

  try {
    await basicSetup();
    await multipleProtocols();
    await networkConfiguration();
    await errorHandling();

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ All examples completed successfully!');
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
  basicSetup,
  multipleProtocols,
  networkConfiguration,
  errorHandling
};
