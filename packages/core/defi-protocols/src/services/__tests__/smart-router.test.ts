/**
 * @fileoverview Tests for SmartRouter
 * @description Unit tests for the smart routing engine
 */

import BigNumber from 'bignumber.js';
import { SmartRouter, SmartRoute } from '../smart-router.js';
import { ProtocolFactory } from '../protocol-factory.js';
import {
  Asset,
  ProtocolConfig,
  NetworkConfig,
} from '../../types/defi-types.js';

// Mock protocol factory
jest.mock('../protocol-factory.js');

const mockNetworkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const mockConfig: ProtocolConfig = {
  protocolId: 'test',
  name: 'Test Protocol',
  network: mockNetworkConfig,
  contractAddresses: {},
  metadata: {},
};

describe('SmartRouter', () => {
  let router: SmartRouter;
  let mockFactory: jest.Mocked<ProtocolFactory>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFactory = new ProtocolFactory() as jest.Mocked<ProtocolFactory>;
    (ProtocolFactory.getInstance as jest.Mock).mockReturnValue(mockFactory);
    router = new SmartRouter(mockConfig, {
      maxHops: 2,
      enabledVenues: ['soroswap', 'sdex'],
      gasCosts: { soroswap: '1000', sdex: '500' },
    });
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const r = new SmartRouter(mockConfig);
      expect(r).toBeInstanceOf(SmartRouter);
    });

    it('should create instance with custom config', () => {
      const r = new SmartRouter(mockConfig, { maxHops: 3 });
      expect(r).toBeInstanceOf(SmartRouter);
    });
  });

  describe('token key conversion', () => {
    it('should convert native asset to XLM key', () => {
      const asset: Asset = { code: 'XLM', type: 'native' };
      const key = (router as any).getTokenKey(asset);
      expect(key).toBe('XLM');
    });

    it('should convert credit asset to code:issuer key', () => {
      const asset: Asset = {
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        type: 'credit_alphanum12',
      };
      const key = (router as any).getTokenKey(asset);
      expect(key).toContain('USDC:');
    });

    it('should parse XLM key back to asset', () => {
      const asset = (router as any).parseTokenKey('XLM');
      expect(asset.code).toBe('XLM');
      expect(asset.type).toBe('native');
    });
  });

  describe('cycle detection', () => {
    it('should detect cycle correctly', () => {
      const path = [
        { from: 'A', to: 'B', venue: 'soroswap' as const },
        { from: 'B', to: 'C', venue: 'soroswap' as const },
      ];
      expect((router as any).isCyclic(path, 'A')).toBe(true);
      expect((router as any).isCyclic(path, 'C')).toBe(true);
      expect((router as any).isCyclic(path, 'D')).toBe(false);
    });
  });

  describe('gas cost calculation', () => {
    it('should calculate gas cost for single venue', () => {
      const path = [{ from: 'XLM', to: 'USDC', venue: 'soroswap' as const }];
      const cost = (router as any).calculateGasCost(path);
      expect(cost.toString()).toBe('1000');
    });

    it('should calculate gas cost for multiple hops same venue', () => {
      const path = [
        { from: 'XLM', to: 'USDC', venue: 'soroswap' as const },
        { from: 'USDC', to: 'ETH', venue: 'soroswap' as const },
      ];
      const cost = (router as any).calculateGasCost(path);
      expect(cost.toString()).toBe('2000');
    });

    it('should calculate gas cost for different venues', () => {
      const path = [
        { from: 'XLM', to: 'USDC', venue: 'soroswap' as const },
        { from: 'USDC', to: 'ETH', venue: 'sdex' as const },
      ];
      const cost = (router as any).calculateGasCost(path);
      expect(cost.toString()).toBe('1500');
    });
  });

  describe('path to token list', () => {
    it('should convert empty path to empty list', () => {
      const tokens = (router as any).pathToTokenList([]);
      expect(tokens).toEqual([]);
    });

    it('should convert path to token list', () => {
      const path = [
        { from: 'XLM', to: 'USDC', venue: 'soroswap' as const },
        { from: 'USDC', to: 'ETH', venue: 'sdex' as const },
      ];
      const tokens = (router as any).pathToTokenList(path);
      expect(tokens).toEqual(['XLM', 'USDC', 'ETH']);
    });
  });

  describe('price impact parsing', () => {
    it('should parse number to number', () => {
      expect((router as any).parsePriceImpact(5.5)).toBe(5.5);
    });

    it('should parse string to number', () => {
      expect((router as any).parsePriceImpact('3.2')).toBe(3.2);
    });

    it('should return 0 for undefined', () => {
      expect((router as any).parsePriceImpact(undefined)).toBe(0);
    });

    it('should return 0 for invalid string', () => {
      expect((router as any).parsePriceImpact('invalid')).toBe(0);
    });
  });
});
