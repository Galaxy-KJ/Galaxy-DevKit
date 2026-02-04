/**
 * @fileoverview Tests for Soroswap Protocol Configuration
 * @description Unit tests for Soroswap config, constants, and helper functions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import {
  SOROSWAP_TESTNET_CONFIG,
  SOROSWAP_MAINNET_CONFIG,
  SOROSWAP_DEFAULT_FEE,
  getSoroswapConfig
} from '../../src/protocols/soroswap/soroswap-config';

describe('Soroswap Configuration', () => {
  describe('SOROSWAP_DEFAULT_FEE', () => {
    it('should be 0.3% (0.003)', () => {
      expect(SOROSWAP_DEFAULT_FEE).toBe('0.003');
    });
  });

  describe('SOROSWAP_TESTNET_CONFIG', () => {
    it('should have correct protocol id', () => {
      expect(SOROSWAP_TESTNET_CONFIG.protocolId).toBe('soroswap');
    });

    it('should have correct name', () => {
      expect(SOROSWAP_TESTNET_CONFIG.name).toBe('Soroswap');
    });

    it('should have testnet network configuration', () => {
      expect(SOROSWAP_TESTNET_CONFIG.network.network).toBe('testnet');
      expect(SOROSWAP_TESTNET_CONFIG.network.horizonUrl).toBe('https://horizon-testnet.stellar.org');
      expect(SOROSWAP_TESTNET_CONFIG.network.sorobanRpcUrl).toBe('https://soroban-testnet.stellar.org');
      expect(SOROSWAP_TESTNET_CONFIG.network.passphrase).toBe('Test SDF Network ; September 2015');
    });

    it('should have router contract address', () => {
      expect(SOROSWAP_TESTNET_CONFIG.contractAddresses.router).toBe(
        'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD'
      );
    });

    it('should have factory contract address', () => {
      expect(SOROSWAP_TESTNET_CONFIG.contractAddresses.factory).toBe(
        'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY'
      );
    });

    it('should have metadata with testnet environment', () => {
      expect(SOROSWAP_TESTNET_CONFIG.metadata.environment).toBe('testnet');
    });
  });

  describe('SOROSWAP_MAINNET_CONFIG', () => {
    it('should have correct protocol id', () => {
      expect(SOROSWAP_MAINNET_CONFIG.protocolId).toBe('soroswap');
    });

    it('should have mainnet network configuration', () => {
      expect(SOROSWAP_MAINNET_CONFIG.network.network).toBe('mainnet');
      expect(SOROSWAP_MAINNET_CONFIG.network.horizonUrl).toBe('https://horizon.stellar.org');
      expect(SOROSWAP_MAINNET_CONFIG.network.sorobanRpcUrl).toBe('https://soroban-rpc.stellar.org');
      expect(SOROSWAP_MAINNET_CONFIG.network.passphrase).toBe('Public Global Stellar Network ; September 2015');
    });

    it('should have router contract address', () => {
      expect(SOROSWAP_MAINNET_CONFIG.contractAddresses.router).toBe(
        'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH'
      );
    });

    it('should have factory contract address', () => {
      expect(SOROSWAP_MAINNET_CONFIG.contractAddresses.factory).toBe(
        'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2'
      );
    });

    it('should have metadata with mainnet environment', () => {
      expect(SOROSWAP_MAINNET_CONFIG.metadata.environment).toBe('mainnet');
    });
  });

  describe('getSoroswapConfig', () => {
    it('should return testnet config for testnet', () => {
      const config = getSoroswapConfig('testnet');
      expect(config).toBe(SOROSWAP_TESTNET_CONFIG);
    });

    it('should return mainnet config for mainnet', () => {
      const config = getSoroswapConfig('mainnet');
      expect(config).toBe(SOROSWAP_MAINNET_CONFIG);
    });
  });
});
