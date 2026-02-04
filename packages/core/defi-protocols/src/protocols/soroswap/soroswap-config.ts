/**
 * @fileoverview Soroswap Protocol Configuration
 * @description Network configurations and contract addresses for Soroswap Protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { ProtocolConfig } from '../../types/defi-types.js';

/**
 * Default swap fee for Soroswap (Uniswap V2 model: 0.3%)
 */
export const SOROSWAP_DEFAULT_FEE = '0.003';

/**
 * Soroswap Protocol Testnet Configuration
 * @description Official Soroswap Protocol contracts on Stellar Testnet
 * @see https://testnet.soroswap.finance/
 */
export const SOROSWAP_TESTNET_CONFIG: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015'
  },
  contractAddresses: {
    // Soroswap Router Contract - Entry point for swaps and liquidity
    router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',

    // Soroswap Factory Contract - Pair creation and management
    factory: 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY'
  },
  metadata: {
    environment: 'testnet',
    version: '1.0.0',
    documentation: 'https://docs.soroswap.finance/',
    website: 'https://testnet.soroswap.finance/'
  }
};

/**
 * Soroswap Protocol Mainnet Configuration
 * @description Official Soroswap Protocol contracts on Stellar Mainnet
 * @see https://soroswap.finance/
 */
export const SOROSWAP_MAINNET_CONFIG: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015'
  },
  contractAddresses: {
    // Soroswap Router Contract - Mainnet
    router: 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',

    // Soroswap Factory Contract - Mainnet
    factory: 'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2'
  },
  metadata: {
    environment: 'mainnet',
    version: '1.0.0',
    documentation: 'https://docs.soroswap.finance/',
    website: 'https://soroswap.finance/'
  }
};

/**
 * Get Soroswap configuration for a specific network
 * @param {string} network - Network name ('testnet' or 'mainnet')
 * @returns {ProtocolConfig} Soroswap protocol configuration
 */
export function getSoroswapConfig(network: 'testnet' | 'mainnet'): ProtocolConfig {
  return network === 'mainnet' ? SOROSWAP_MAINNET_CONFIG : SOROSWAP_TESTNET_CONFIG;
}
