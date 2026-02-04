/**
 * @fileoverview Tests for Protocol Factory
 * @description Unit tests for the protocol factory service
 */

import { ProtocolFactory, getProtocolFactory } from '../../src/services/protocol-factory.js';
import { BaseProtocol } from '../../src/protocols/base-protocol.js';
import { ProtocolConfig, ProtocolType, ProtocolStats } from '../../src/types/defi-types.js';
import { IDefiProtocol } from '../../src/types/protocol-interface.js';
import { Asset, TransactionResult, Position, HealthFactor, APYInfo } from '../../src/types/defi-types.js';

// Mock protocol implementation for testing
class MockProtocol extends BaseProtocol {
  protected getProtocolType(): ProtocolType {
    return ProtocolType.LENDING;
  }

  protected async setupProtocol(): Promise<void> {
    // Mock setup
  }

  public async getStats(): Promise<ProtocolStats> {
    return {
      totalSupply: '1000000',
      totalBorrow: '500000',
      tvl: '1000000',
      utilizationRate: 50,
      timestamp: new Date()
    };
  }

  public async supply(): Promise<TransactionResult> {
    throw new Error('Not implemented');
  }

  public async borrow(): Promise<TransactionResult> {
    throw new Error('Not implemented');
  }

  public async repay(): Promise<TransactionResult> {
    throw new Error('Not implemented');
  }

  public async withdraw(): Promise<TransactionResult> {
    throw new Error('Not implemented');
  }

  public async getPosition(): Promise<Position> {
    throw new Error('Not implemented');
  }

  public async getHealthFactor(): Promise<HealthFactor> {
    throw new Error('Not implemented');
  }

  public async getSupplyAPY(): Promise<APYInfo> {
    throw new Error('Not implemented');
  }

  public async getBorrowAPY(): Promise<APYInfo> {
    throw new Error('Not implemented');
  }

  public async getTotalSupply(): Promise<string> {
    throw new Error('Not implemented');
  }

  public async getTotalBorrow(): Promise<string> {
    throw new Error('Not implemented');
  }
}

describe('ProtocolFactory', () => {
  let factory: ProtocolFactory;
  const mockConfig: ProtocolConfig = {
    protocolId: 'mock-protocol',
    name: 'Mock Protocol',
    network: {
      network: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      passphrase: 'Test SDF Network ; September 2015'
    },
    contractAddresses: {
      main: 'CTEST123'
    },
    metadata: {}
  };

  beforeEach(() => {
    factory = ProtocolFactory.getInstance();
    factory.clear(); // Clear all registered protocols
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ProtocolFactory.getInstance();
      const instance2 = ProtocolFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return same instance via getProtocolFactory', () => {
      const instance1 = getProtocolFactory();
      const instance2 = getProtocolFactory();
      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    it('should register a protocol successfully', () => {
      expect(() => {
        factory.register('mock-protocol', MockProtocol);
      }).not.toThrow();

      expect(factory.isProtocolRegistered('mock-protocol')).toBe(true);
    });

    it('should throw error when registering duplicate protocol', () => {
      factory.register('mock-protocol', MockProtocol);

      expect(() => {
        factory.register('mock-protocol', MockProtocol);
      }).toThrow('Protocol mock-protocol is already registered');
    });
  });

  describe('unregister', () => {
    it('should unregister a protocol', () => {
      factory.register('mock-protocol', MockProtocol);
      expect(factory.isProtocolRegistered('mock-protocol')).toBe(true);

      factory.unregister('mock-protocol');
      expect(factory.isProtocolRegistered('mock-protocol')).toBe(false);
    });

    it('should not throw error when unregistering non-existent protocol', () => {
      expect(() => {
        factory.unregister('non-existent');
      }).not.toThrow();
    });
  });

  describe('createProtocol', () => {
    beforeEach(() => {
      factory.register('mock-protocol', MockProtocol);
    });

    it('should create protocol instance', () => {
      const protocol = factory.createProtocol(mockConfig);
      expect(protocol).toBeInstanceOf(MockProtocol);
      expect(protocol.protocolId).toBe('mock-protocol');
      expect(protocol.name).toBe('Mock Protocol');
    });

    it('should throw error for unregistered protocol', () => {
      const invalidConfig = { ...mockConfig, protocolId: 'unregistered' };

      expect(() => {
        factory.createProtocol(invalidConfig);
      }).toThrow('Protocol unregistered is not registered');
    });

    it('should list available protocols in error message', () => {
      factory.register('protocol-1', MockProtocol);
      factory.register('protocol-2', MockProtocol);

      const invalidConfig = { ...mockConfig, protocolId: 'unregistered' };

      try {
        factory.createProtocol(invalidConfig);
      } catch (error) {
        expect((error as Error).message).toContain('Available protocols:');
        expect((error as Error).message).toContain('protocol-1');
        expect((error as Error).message).toContain('protocol-2');
      }
    });
  });

  describe('getSupportedProtocols', () => {
    it('should return empty array when no protocols registered', () => {
      const protocols = factory.getSupportedProtocols();
      expect(protocols).toEqual([]);
    });

    it('should return list of registered protocols', () => {
      factory.register('protocol-1', MockProtocol);
      factory.register('protocol-2', MockProtocol);

      const protocols = factory.getSupportedProtocols();
      expect(protocols).toHaveLength(2);
      expect(protocols).toContain('protocol-1');
      expect(protocols).toContain('protocol-2');
    });
  });

  describe('isProtocolRegistered', () => {
    it('should return true for registered protocol', () => {
      factory.register('mock-protocol', MockProtocol);
      expect(factory.isProtocolRegistered('mock-protocol')).toBe(true);
    });

    it('should return false for unregistered protocol', () => {
      expect(factory.isProtocolRegistered('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all registered protocols', () => {
      factory.register('protocol-1', MockProtocol);
      factory.register('protocol-2', MockProtocol);

      expect(factory.getSupportedProtocols()).toHaveLength(2);

      factory.clear();

      expect(factory.getSupportedProtocols()).toHaveLength(0);
    });
  });
});
