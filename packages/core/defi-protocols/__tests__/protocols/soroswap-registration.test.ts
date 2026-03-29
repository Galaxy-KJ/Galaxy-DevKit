/**
 * @fileoverview Tests for Soroswap Protocol factory registration
 * @description Unit tests for Soroswap auto-registration with the protocol factory
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { ProtocolFactory, getProtocolFactory } from '../../src/services/protocol-factory';
import { SoroswapProtocol } from '../../src/protocols/soroswap/soroswap-protocol';
import { SOROSWAP_TESTNET_CONFIG } from '../../src/protocols/soroswap/soroswap-config';

// Mock Stellar SDK to avoid real network calls
jest.mock('@stellar/stellar-sdk', () => {
  const mockContract = jest.fn().mockImplementation(() => ({
    call: jest.fn(),
  }));

  return {
    Contract: mockContract,
    TransactionBuilder: jest.fn(),
    Keypair: {
      fromSecret: jest.fn(),
      fromPublicKey: jest.fn().mockReturnValue({ publicKey: () => 'test' }),
      random: jest.fn(),
    },
    Address: jest.fn(),
    nativeToScVal: jest.fn(),
    BASE_FEE: '100',
    rpc: {
      Server: jest.fn(),
      Api: { isSimulationError: jest.fn() },
      assembleTransaction: jest.fn(),
    },
    StrKey: { isValidEd25519PublicKey: jest.fn().mockReturnValue(true) },
    Horizon: { Server: jest.fn() },
    Networks: { TESTNET: 'TESTNET', PUBLIC: 'PUBLIC' },
    Asset: jest.fn(),
  };
});

describe('Soroswap Registration', () => {
  let factory: ProtocolFactory;

  beforeEach(() => {
    factory = getProtocolFactory();
    // Unregister soroswap if it was auto-registered by a previous test
    if (factory.isProtocolRegistered('soroswap')) {
      factory.unregister('soroswap');
    }
  });

  it('should register soroswap with the factory via registerSoroswapProtocol()', () => {
    const { registerSoroswapProtocol } = require('../../src/protocols/soroswap/soroswap-registration');

    // Module may have already auto-registered; unregister first
    if (factory.isProtocolRegistered('soroswap')) {
      factory.unregister('soroswap');
    }

    registerSoroswapProtocol();

    expect(factory.isProtocolRegistered('soroswap')).toBe(true);
  });

  it('should create SoroswapProtocol instance via factory', () => {
    if (!factory.isProtocolRegistered('soroswap')) {
      factory.register('soroswap', SoroswapProtocol);
    }

    const protocol = factory.createProtocol(SOROSWAP_TESTNET_CONFIG);

    expect(protocol).toBeInstanceOf(SoroswapProtocol);
    expect(protocol.protocolId).toBe('soroswap');
    expect(protocol.name).toBe('Soroswap');
  });

  it('should include soroswap in supported protocols list', () => {
    if (!factory.isProtocolRegistered('soroswap')) {
      factory.register('soroswap', SoroswapProtocol);
    }

    const supported = factory.getSupportedProtocols();
    expect(supported).toContain('soroswap');
  });
});
