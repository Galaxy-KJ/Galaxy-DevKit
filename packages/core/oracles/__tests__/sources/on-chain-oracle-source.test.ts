/**
 * @fileoverview OnChainOracleSource tests
 */

import * as stellar from '@stellar/stellar-sdk';
import { OnChainOracleSource, OnChainOracle } from '../../src/sources/real/OnChainOracleSource.js';

// Mocks for Stellar SDK (using hoisting-safe anonymous wrappers)
const mockSimulate = jest.fn();
const mockGetLedger = jest.fn();
const mockScValNative = jest.fn();
const mockIsSimError = jest.fn().mockReturnValue(false);

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...original,
    scValToNative: (val: any) => mockScValNative(val),
    rpc: {
      ...original.rpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: (tx: any) => mockSimulate(tx),
        getLedgerEntries: (footprint: any) => mockGetLedger(footprint),
      })),
      Api: {
        isSimulationError: (sim: any) => mockIsSimError(sim),
      },
    },
  };
});

const mockSimulateTransaction = mockSimulate;
const mockGetLedgerEntries = mockGetLedger;
const mockScValToNative = mockScValNative;
const mockIsSimulationError = mockIsSimError;

describe('OnChainOracleSource', () => {
  const contractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
  const rpcUrl = 'https://soroban-testnet.stellar.org';
  let source: OnChainOracleSource;

  beforeEach(() => {
    jest.clearAllMocks();
    source = new OnChainOracleSource(contractId, rpcUrl);
  });

  // ── constructor ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws if contractId is missing', () => {
      expect(() => new OnChainOracleSource('', rpcUrl)).toThrow('Contract ID is required');
    });

    it('throws if rpcUrl is missing', () => {
      expect(() => new OnChainOracleSource(contractId, '')).toThrow('RPC URL is required');
    });

    it('creates instance with valid parameters', () => {
      expect(source).toBeInstanceOf(OnChainOracleSource);
      expect(source.name).toBe('on-chain-oracle');
    });
  });

  // ── getPrice ───────────────────────────────────────────────────────────────

  describe('getPrice', () => {
    it('successfully fetches and decodes a price', async () => {
      const mockRetval = {}; // Dummy retval
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockRetval },
      });

      // PriceEntry: price scaled by 1,000,000. 1.25 -> 1_250_000n
      mockScValToNative.mockReturnValueOnce({
        price: 1250000n,
        timestamp: 1716768000n, // 2024-05-27T00:00:00Z
        pusher: 'GAAAAAA',
      });

      const result = await source.getPrice('XLM');

      expect(result.symbol).toBe('XLM');
      expect(result.price).toBe(1.25);
      expect(result.timestamp).toEqual(new Date(1716768000 * 1000));
      expect(result.source).toBe('on-chain-oracle');
      expect(result.metadata?.contractId).toBe(contractId);
      expect(result.metadata?.base).toBe('XLM');
      expect(result.metadata?.quote).toBe('USDC');
    });

    it('parses slashes in asset symbol correctly (BTC/USDT)', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: {} },
      });
      mockScValToNative.mockReturnValueOnce({
        price: 65000000000n, // 65,000.00
        timestamp: 1716768000n,
        pusher: 'GAAAAAA',
      });

      const result = await source.getPrice('BTC/USDT');

      expect(result.symbol).toBe('BTC/USDT');
      expect(result.price).toBe(65000);
      expect(result.metadata?.base).toBe('BTC');
      expect(result.metadata?.quote).toBe('USDT');
    });

    it('throws if simulation returns an error', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'Contract panicked: Out of range',
      });
      mockIsSimulationError.mockReturnValueOnce(true);

      await expect(source.getPrice('XLM')).rejects.toThrow('Soroban RPC simulation failed');
    });

    it('throws if simulation returns no result', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({});
      mockIsSimulationError.mockReturnValueOnce(false);

      await expect(source.getPrice('XLM')).rejects.toThrow('Invalid simulation response');
    });

    it('throws if scValToNative returns invalid data structure', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: {} },
      });
      mockIsSimulationError.mockReturnValueOnce(false);
      mockScValToNative.mockReturnValueOnce(null); // Invalid retval

      await expect(source.getPrice('XLM')).rejects.toThrow('Failed to decode price entry');
    });

    it('throws if decoded price entry lacks price or timestamp', async () => {
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: {} },
      });
      mockIsSimulationError.mockReturnValueOnce(false);
      mockScValToNative.mockReturnValueOnce({
        pusher: 'GAAAAAA', // missing price and timestamp
      });

      await expect(source.getPrice('XLM')).rejects.toThrow('Decoded price entry lacks required fields');
    });
  });

  // ── getPrices ──────────────────────────────────────────────────────────────

  describe('getPrices', () => {
    it('fetches multiple prices in parallel', async () => {
      // Mock simulate for XLM and BTC
      mockSimulateTransaction
        .mockResolvedValueOnce({
          result: { retval: {} },
        })
        .mockResolvedValueOnce({
          result: { retval: {} },
        });

      mockScValToNative
        .mockReturnValueOnce({
          price: 120000n, // 0.12
          timestamp: 1716768000n,
          pusher: 'GAAAAAA',
        })
        .mockReturnValueOnce({
          price: 65000000000n, // 65,000
          timestamp: 1716768000n,
          pusher: 'GAAAAAA',
        });

      const results = await source.getPrices(['XLM', 'BTC']);

      expect(results).toHaveLength(2);
      expect(results[0].symbol).toBe('XLM');
      expect(results[0].price).toBe(0.12);
      expect(results[1].symbol).toBe('BTC');
      expect(results[1].price).toBe(65000);
    });

    it('skips failed symbols instead of crashing the entire batch', async () => {
      mockSimulateTransaction
        .mockResolvedValueOnce({
          result: { retval: {} },
        })
        .mockRejectedValueOnce(new Error('RPC failure'));

      mockScValToNative.mockReturnValueOnce({
        price: 120000n,
        timestamp: 1716768000n,
        pusher: 'GAAAAAA',
      });

      const results = await source.getPrices(['XLM', 'BTC']);

      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('XLM');
    });
  });

  // ── getSourceInfo ──────────────────────────────────────────────────────────

  describe('getSourceInfo', () => {
    it('returns correct source information', () => {
      const info = source.getSourceInfo();
      expect(info.name).toBe('on-chain-oracle');
      expect(info.description).toContain('Soroban');
      expect(info.version).toBe('1.0.0');
      expect(info.metadata?.contractId).toBe(contractId);
    });
  });

  // ── isHealthy ──────────────────────────────────────────────────────────────

  describe('isHealthy', () => {
    it('returns true when ledger query succeeds', async () => {
      mockGetLedgerEntries.mockResolvedValueOnce({
        entries: [],
      });
      const healthy = await source.isHealthy();
      expect(healthy).toBe(true);
    });

    it('returns false when ledger query throws', async () => {
      mockGetLedgerEntries.mockRejectedValueOnce(new Error('Network error'));
      const healthy = await source.isHealthy();
      expect(healthy).toBe(false);
    });
  });
});

describe('OnChainOracle (Standalone Client)', () => {
  const contractId = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
  const rpcUrl = 'https://soroban-testnet.stellar.org';
  let oracle: OnChainOracle;

  beforeEach(() => {
    jest.clearAllMocks();
    oracle = new OnChainOracle(contractId, rpcUrl);
  });

  it('getPrice returns simple custom object formatted correctly', async () => {
    mockSimulateTransaction.mockResolvedValueOnce({
      result: { retval: {} },
    });
    mockScValToNative.mockReturnValueOnce({
      price: 150000n, // 0.15
      timestamp: 1716768000n,
      pusher: 'GAAAAAA',
    });

    const result = await oracle.getPrice('XLM');
    expect(result.price).toBe(0.15);
    expect(result.timestamp).toBe(1716768000 * 1000);
  });

  it('getPrices returns Map as requested by Issue #276', async () => {
    mockSimulateTransaction
      .mockResolvedValueOnce({
        result: { retval: {} },
      })
      .mockResolvedValueOnce({
        result: { retval: {} },
      });

    mockScValToNative
      .mockReturnValueOnce({
        price: 150000n, // 0.15
        timestamp: 1716768000n,
        pusher: 'GAAAAAA',
      })
      .mockReturnValueOnce({
        price: 3200000000n, // 3200
        timestamp: 1716768000n,
        pusher: 'GAAAAAA',
      });

    const result = await oracle.getPrices(['XLM', 'ETH']);
    expect(result).toBeInstanceOf(Map);
    expect(result.get('XLM')).toBe(0.15);
    expect(result.get('ETH')).toBe(3200);
  });
});
