/**
 * @fileoverview Tests for DexAggregatorService
 */

import { DexAggregatorService } from '../src/services/DexAggregatorService.js';
import { Asset, ProtocolConfig } from '@galaxy-kj/core-defi-protocols';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSoroswapQuote = {
  amountOut: '95.0000000',
  priceImpact: '0.5',
  path: ['native', 'USDC:GA5Z...'],
};

jest.mock('@galaxy-kj/core-defi-protocols', () => {
  const actual = jest.requireActual('@galaxy-kj/core-defi-protocols');
  return {
    ...actual,
    ProtocolFactory: {
      getInstance: () => ({
        createProtocol: () => ({
          initialize: jest.fn().mockResolvedValue(undefined),
          getSwapQuote: jest.fn().mockResolvedValue(mockSoroswapQuote),
          swap: jest.fn().mockResolvedValue({ hash: 'mock-unsigned-xdr-soroswap' }),
        }),
      }),
    },
  };
});

// Mock global fetch for SDEX calls
const mockSdexRecord = {
  source_amount: '100',
  destination_amount: '93.5000000',
  path: [],
  source_asset_type: 'native',
  destination_asset_type: 'credit_alphanum4',
  destination_asset_code: 'USDC',
  destination_asset_issuer: 'GA5Z...',
};

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ _embedded: { records: [mockSdexRecord] } }),
} as any);

// Mock Horizon.Server
const mockHorizonServer = {
  serverURL: 'https://horizon-testnet.stellar.org',
  loadAccount: jest.fn().mockResolvedValue({
    accountId: () => 'GDTEST...',
    sequenceNumber: () => '1',
    incrementSequenceNumber: jest.fn(),
    sequence: '1',
  }),
} as any;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN', type: 'credit_alphanum4' };

const soroswapConfig: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  contractAddresses: {
    router: 'CA_ROUTER_MOCK',
    factory: 'CA_FACTORY_MOCK',
  },
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DexAggregatorService', () => {
  let aggregator: DexAggregatorService;

  beforeEach(() => {
    aggregator = new DexAggregatorService(mockHorizonServer, soroswapConfig);
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [mockSdexRecord] } }),
    });
  });

  // -------------------------------------------------------------------------
  describe('getAggregatedQuote', () => {
    it('returns routes from both SDEX and Soroswap sorted best-first', async () => {
      const quote = await aggregator.getAggregatedQuote({
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
      });

      expect(quote.routes.length).toBe(2);
      expect(quote.bestRoute).toBeDefined();
      // Soroswap returns 95, SDEX returns 93.5 — Soroswap should be best
      expect(quote.bestRoute.source).toBe('soroswap');
      expect(quote.bestRoute.amountOut).toBe('95.0000000');
      expect(quote.timestamp).toBeInstanceOf(Date);
    });

    it('sets highImpactWarning when priceImpact >= 5%', async () => {
      const { ProtocolFactory } = require('@galaxy-kj/core-defi-protocols');
      ProtocolFactory.getInstance().createProtocol = () => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        getSwapQuote: jest.fn().mockResolvedValue({ ...mockSoroswapQuote, priceImpact: '6.0' }),
        swap: jest.fn(),
      });

      const quote = await aggregator.getAggregatedQuote({
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
      });

      expect(quote.highImpactWarning).toBe(true);
    });

    it('returns only SDEX route when sources is ["sdex"]', async () => {
      const quote = await aggregator.getAggregatedQuote({
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
        sources: ['sdex'],
      });

      expect(quote.routes.length).toBe(1);
      expect(quote.routes[0].source).toBe('sdex');
    });

    it('returns only Soroswap route when sources is ["soroswap"]', async () => {
      const quote = await aggregator.getAggregatedQuote({
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
        sources: ['soroswap'],
      });

      expect(quote.routes.length).toBe(1);
      expect(quote.routes[0].source).toBe('soroswap');
    });

    it('throws when no routes are found', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ _embedded: { records: [] } }),
      });

      const { ProtocolFactory } = require('@galaxy-kj/core-defi-protocols');
      ProtocolFactory.getInstance().createProtocol = () => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        getSwapQuote: jest.fn().mockRejectedValue(new Error('No pool')),
        swap: jest.fn(),
      });

      await expect(
        aggregator.getAggregatedQuote({
          assetIn: XLM,
          assetOut: USDC,
          amountIn: '100',
        })
      ).rejects.toThrow('No routes found');
    });

    it('continues with available sources when one source fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('SDEX unavailable'));

      const quote = await aggregator.getAggregatedQuote({
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
      });

      expect(quote.routes.length).toBe(1);
      expect(quote.routes[0].source).toBe('soroswap');
    });
  });

  // -------------------------------------------------------------------------
  describe('comparePrices', () => {
    it('returns price comparison with bestSource set correctly', async () => {
      const comparison = await aggregator.comparePrices(XLM, USDC, '100');

      expect(comparison.prices.length).toBe(2);
      expect(comparison.bestSource).toBeDefined();
      expect(['sdex', 'soroswap']).toContain(comparison.bestSource);
    });

    it('marks unavailable sources when they fail', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('SDEX down'));

      const comparison = await aggregator.comparePrices(XLM, USDC, '100');

      const sdexEntry = comparison.prices.find((p) => p.source === 'sdex');
      expect(sdexEntry?.available).toBe(false);
      expect(sdexEntry?.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  describe('executeAggregatedSwap', () => {
    it('executes swap via Soroswap when it is the best route', async () => {
      const result = await aggregator.executeAggregatedSwap({
        signerPublicKey: 'GDTEST...',
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
        minAmountOut: '90',
      });

      expect(result.source).toBe('soroswap');
      expect(result.xdr).toBe('mock-unsigned-xdr-soroswap');
      expect(result.quote).toBeDefined();
    });

    it('respects preferredSource when provided', async () => {
      const result = await aggregator.executeAggregatedSwap({
        signerPublicKey: 'GDTEST...',
        assetIn: XLM,
        assetOut: USDC,
        amountIn: '100',
        minAmountOut: '90',
        preferredSource: 'soroswap',
      });

      expect(result.source).toBe('soroswap');
    });
  });

  // -------------------------------------------------------------------------
  describe('applySlippage (static helper)', () => {
    it('applies 5% slippage by default', () => {
      const result = DexAggregatorService.applySlippage('100');
      expect(result).toBe('95.0000000');
    });

    it('applies custom slippage', () => {
      const result = DexAggregatorService.applySlippage('200', 0.01);
      expect(result).toBe('198.0000000');
    });
  });

  // -------------------------------------------------------------------------
  describe('Aquarius (stub)', () => {
    it('throws a descriptive error when aquarius source is requested', async () => {
      await expect(
        aggregator.getAggregatedQuote({
          assetIn: XLM,
          assetOut: USDC,
          amountIn: '100',
          sources: ['aquarius'],
        })
      ).rejects.toThrow('No routes found');
    });
  });
});
