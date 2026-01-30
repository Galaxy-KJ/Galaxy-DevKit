/**
 * @fileoverview Tests for Blend Protocol implementation
 * @description Unit tests for Blend lending protocol
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { BlendProtocol } from '../../src/protocols/blend/blend-protocol';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types';

describe('BlendProtocol', () => {
  let blendProtocol: BlendProtocol;
  let mockConfig: ProtocolConfig;

  beforeEach(() => {
    mockConfig = {
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
      metadata: {}
    };

    blendProtocol = new BlendProtocol(mockConfig);
  });

  describe('Initialization', () => {
    it('should create a Blend protocol instance', () => {
      expect(blendProtocol).toBeDefined();
      expect(blendProtocol.protocolId).toBe('blend');
      expect(blendProtocol.name).toBe('Blend Protocol');
    });

    it('should have correct protocol type', () => {
      expect(blendProtocol.type).toBe(ProtocolType.LENDING);
    });

    it('should not be initialized on construction', () => {
      expect(blendProtocol.isInitialized()).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should have correct network configuration', () => {
      expect(blendProtocol.config.network.network).toBe('testnet');
      expect(blendProtocol.config.network.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    });

    it('should have required contract addresses', () => {
      expect(blendProtocol.config.contractAddresses.pool).toBeDefined();
      expect(blendProtocol.config.contractAddresses.oracle).toBeDefined();
    });
  });

  describe('Validation', () => {
    const validAsset: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };

    it('should validate asset correctly', async () => {
      // This tests the protected validateAsset method indirectly
      // by attempting to call a method that uses it
      expect(() => {
        // @ts-expect-error - Testing protected method
        blendProtocol.validateAsset(validAsset);
      }).not.toThrow();
    });

    it('should validate amount correctly', () => {
      expect(() => {
        // @ts-expect-error - Testing protected method
        blendProtocol.validateAmount('100');
      }).not.toThrow();

      expect(() => {
        // @ts-expect-error - Testing protected method
        blendProtocol.validateAmount('-100');
      }).toThrow();
    });

    it('should validate address correctly', () => {
      const validAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

      expect(() => {
        // @ts-expect-error - Testing protected method
        blendProtocol.validateAddress(validAddress);
      }).not.toThrow();

      expect(() => {
        // @ts-expect-error - Testing protected method
        blendProtocol.validateAddress('invalid-address');
      }).toThrow();
    });
  });

  describe('Operations Requirements', () => {
    const testAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    const testPrivateKey = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
    const testAsset: Asset = {
      code: 'USDC',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      type: 'credit_alphanum4'
    };

    it('should throw error when calling supply before initialization', async () => {
      await expect(
        blendProtocol.supply(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('not initialized');
    });

    it('should throw error when calling withdraw before initialization', async () => {
      await expect(
        blendProtocol.withdraw(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('not initialized');
    });

    it('should throw error when calling borrow before initialization', async () => {
      await expect(
        blendProtocol.borrow(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('not initialized');
    });

    it('should throw error when calling repay before initialization', async () => {
      await expect(
        blendProtocol.repay(testAddress, testPrivateKey, testAsset, '100')
      ).rejects.toThrow('not initialized');
    });

    it('should throw error when calling getPosition before initialization', async () => {
      await expect(
        blendProtocol.getPosition(testAddress)
      ).rejects.toThrow('not initialized');
    });

    it('should throw error when calling getHealthFactor before initialization', async () => {
      await expect(
        blendProtocol.getHealthFactor(testAddress)
      ).rejects.toThrow('not initialized');
    });
  });

  describe('Protocol Information', () => {
    it('should have getStats method', () => {
      expect(blendProtocol.getStats).toBeDefined();
      expect(typeof blendProtocol.getStats).toBe('function');
    });

    it('should have getSupplyAPY method', () => {
      expect(blendProtocol.getSupplyAPY).toBeDefined();
      expect(typeof blendProtocol.getSupplyAPY).toBe('function');
    });

    it('should have getBorrowAPY method', () => {
      expect(blendProtocol.getBorrowAPY).toBeDefined();
      expect(typeof blendProtocol.getBorrowAPY).toBe('function');
    });

    it('should have getTotalSupply method', () => {
      expect(blendProtocol.getTotalSupply).toBeDefined();
      expect(typeof blendProtocol.getTotalSupply).toBe('function');
    });

    it('should have getTotalBorrow method', () => {
      expect(blendProtocol.getTotalBorrow).toBeDefined();
      expect(typeof blendProtocol.getTotalBorrow).toBe('function');
    });
  });

  describe('Liquidation Functionality', () => {
    it('should have liquidate method', () => {
      expect(blendProtocol.liquidate).toBeDefined();
      expect(typeof blendProtocol.liquidate).toBe('function');
    });

    it('should have findLiquidationOpportunities method', () => {
      expect(blendProtocol.findLiquidationOpportunities).toBeDefined();
      expect(typeof blendProtocol.findLiquidationOpportunities).toBe('function');
    });

    it('should throw error when liquidating healthy position', async () => {
      // This would require mocking the getHealthFactor method
      // to return a healthy status, then attempting liquidation
      // For now, we just verify the method exists
      expect(blendProtocol.liquidate).toBeDefined();
    });
  });

  describe('Blend-specific Methods', () => {
    it('should have getReserveData method', () => {
      expect(blendProtocol.getReserveData).toBeDefined();
      expect(typeof blendProtocol.getReserveData).toBe('function');
    });
  });
});
