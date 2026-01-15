/**
 * @fileoverview Network configurations for DeFi protocols
 * @description Contains network configurations for testnet and mainnet
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { NetworkConfig } from '../types/defi-types';

/**
 * Testnet network configuration
 */
export const TESTNET_CONFIG: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015'
};

/**
 * Mainnet network configuration
 */
export const MAINNET_CONFIG: NetworkConfig = {
  network: 'mainnet',
  horizonUrl: 'https://horizon.stellar.org',
  sorobanRpcUrl: 'https://soroban-mainnet.stellar.org',
  passphrase: 'Public Global Stellar Network ; September 2015'
};

/**
 * Get network configuration by name
 * @param {string} network - Network name ('testnet' or 'mainnet')
 * @returns {NetworkConfig} Network configuration
 */
export function getNetworkConfig(network: 'testnet' | 'mainnet'): NetworkConfig {
  return network === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
}
