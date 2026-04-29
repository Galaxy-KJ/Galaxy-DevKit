/**
 * Unit tests for the public `IDexAggregator` implementation.
 *
 * The aggregator orchestrates two existing collaborators:
 *   - `DexAggregatorService` for quoting (already covered by DexAggregator.test.ts)
 *   - `IProtocolFactory.createProtocol(...).swap(...)` for execution
 *
 * Both are stubbed here so the tests focus on the orchestration logic that
 * lives in `services/dex-aggregator.ts` (slippage math, route picking, error
 * paths, swap dispatch).
 */

import { DexAggregator } from '../../src/services/dex-aggregator';
import type {
  AggregatorQuote,
  AggregatorRoute,
} from '../../src/aggregator/types';
import type { Asset, ProtocolConfig } from '../../src/types/defi-types';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4',
};

const baseConfig: ProtocolConfig = {
  protocolId: 'soroswap',
  name: 'Soroswap',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  contractAddresses: { router: 'CA_ROUTER', factory: 'CA_FACTORY' },
  metadata: {},
};

const sampleRoute = (overrides: Partial<AggregatorRoute> = {}): AggregatorRoute => ({
  venue: 'soroswap',
  amountIn: '100',
  amountOut: '95.0000000',
  priceImpact: 0.5,
  path: ['native', 'USDC'],
  ...overrides,
});

const sampleQuote = (routes: AggregatorRoute[], totalAmountOut?: string): AggregatorQuote => ({
  assetIn: XLM,
  assetOut: USDC,
  amountIn: '100',
  routes,
  totalAmountOut:
    totalAmountOut ??
    routes
      .reduce((acc, r) => acc + parseFloat(r.amountOut), 0)
      .toFixed(7),
  effectivePrice: 0.95,
  savingsVsBestSingle: 0,
});

describe('DexAggregator (services/dex-aggregator.ts)', () => {
  describe('static helpers', () => {
    it('pickBestRoute returns the route with the highest amountOut', () => {
      const routes = [
        sampleRoute({ venue: 'soroswap', amountOut: '95.0000000' }),
        sampleRoute({ venue: 'sdex', amountOut: '96.5000000' }),
      ];
      expect(DexAggregator.pickBestRoute(routes).venue).toBe('sdex');
    });

    it('pickBestRoute throws on empty input', () => {
      expect(() => DexAggregator.pickBestRoute([])).toThrow(/empty list/);
    });

    it('applySlippage reduces the amount by the requested basis points', () => {
      // 50 bps = 0.5 %; 100 → 99.5
      expect(DexAggregator.applySlippage('100', 50)).toBe('99.5000000');
      // 0 bps is a no-op (rounded to 7dp)
      expect(DexAggregator.applySlippage('100', 0)).toBe('100.0000000');
      // 1000 bps = 10 %; 200 → 180
      expect(DexAggregator.applySlippage('200', 1_000)).toBe('180.0000000');
    });

    it('fromQuote flags split quotes correctly', () => {
      const single = DexAggregator.fromQuote(sampleQuote([sampleRoute()]));
      expect(single.isSplit).toBe(false);
      expect(single.bestRoute.venue).toBe('soroswap');

      const split = DexAggregator.fromQuote(
        sampleQuote([
          sampleRoute({ venue: 'soroswap', amountOut: '40' }),
          sampleRoute({ venue: 'sdex', amountOut: '60' }),
        ]),
      );
      expect(split.isSplit).toBe(true);
      expect(split.bestRoute.venue).toBe('sdex');
    });
  });

  describe('getBestPrice', () => {
    it('delegates to the underlying quote service and wraps the result', async () => {
      const quote = sampleQuote([
        sampleRoute({ venue: 'soroswap', amountOut: '95' }),
        sampleRoute({ venue: 'sdex', amountOut: '93.5', amountIn: '0' }),
      ]);
      const quoteService = { getBestQuote: jest.fn().mockResolvedValue(quote) };
      const aggregator = new DexAggregator(baseConfig, {
        quoteService,
        protocolFactory: { createProtocol: jest.fn() },
      });

      const result = await aggregator.getBestPrice(XLM, USDC, '100');

      expect(quoteService.getBestQuote).toHaveBeenCalledWith(XLM, USDC, '100');
      expect(result.bestRoute.venue).toBe('soroswap');
      expect(result.isSplit).toBe(true);
      expect(result.quote).toBe(quote);
    });
  });

  describe('executeBestRoute', () => {
    const buildSwappingProtocol = () => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      swap: jest.fn().mockImplementation(
        (
          _wallet: string,
          _key: string,
          _in: Asset,
          _out: Asset,
          amountIn: string,
          _min: string,
        ) => ({
          hash: `tx-${amountIn}`,
          status: 'success' as const,
          ledger: 1,
          createdAt: new Date(),
          metadata: {},
        }),
      ),
    });

    it('rejects when walletAddress is missing', async () => {
      const aggregator = new DexAggregator(baseConfig, {
        quoteService: { getBestQuote: jest.fn() },
        protocolFactory: { createProtocol: jest.fn() },
      });

      await expect(
        aggregator.executeBestRoute(XLM, USDC, '100', {
          walletAddress: '',
          privateKey: 'S...',
        }),
      ).rejects.toThrow(/walletAddress is required/);
    });

    it('rejects on out-of-range slippage', async () => {
      const aggregator = new DexAggregator(baseConfig, {
        quoteService: {
          getBestQuote: jest.fn().mockResolvedValue(sampleQuote([sampleRoute()])),
        },
        protocolFactory: { createProtocol: jest.fn() },
      });

      await expect(
        aggregator.executeBestRoute(XLM, USDC, '100', {
          walletAddress: 'GUSER',
          privateKey: 'SKEY',
          slippageBps: 99_999,
        }),
      ).rejects.toThrow(/slippageBps must be in/);
    });

    it('uses precomputed BestPriceResult to skip a re-quote', async () => {
      const quoteService = {
        getBestQuote: jest.fn().mockRejectedValue(new Error('should not be called')),
      };
      const proto = buildSwappingProtocol();
      const factory = { createProtocol: jest.fn().mockReturnValue(proto) };
      const precomputed = DexAggregator.fromQuote(sampleQuote([sampleRoute()]));

      const aggregator = new DexAggregator(baseConfig, {
        quoteService,
        protocolFactory: factory,
      });

      const result = await aggregator.executeBestRoute(XLM, USDC, '100', {
        walletAddress: 'GUSER',
        privateKey: 'SKEY',
        precomputed,
      });

      expect(quoteService.getBestQuote).not.toHaveBeenCalled();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].transaction.hash).toBe('tx-100');
    });

    it('dispatches one swap per route in a split quote and applies slippage to each leg', async () => {
      const split = sampleQuote([
        sampleRoute({ venue: 'soroswap', amountIn: '40', amountOut: '38' }),
        sampleRoute({ venue: 'sdex', amountIn: '60', amountOut: '57' }),
      ]);
      const proto = buildSwappingProtocol();
      const factory = { createProtocol: jest.fn().mockReturnValue(proto) };

      const aggregator = new DexAggregator(baseConfig, {
        quoteService: { getBestQuote: jest.fn().mockResolvedValue(split) },
        protocolFactory: factory,
      });

      const result = await aggregator.executeBestRoute(XLM, USDC, '100', {
        walletAddress: 'GUSER',
        privateKey: 'SKEY',
        slippageBps: 100, // 1 %
      });

      expect(result.results).toHaveLength(2);
      expect(proto.swap).toHaveBeenCalledTimes(2);

      // First call: soroswap leg, amountIn=40, amountOut=38, minAmountOut = 37.62
      expect(proto.swap.mock.calls[0]).toEqual([
        'GUSER',
        'SKEY',
        XLM,
        USDC,
        '40',
        '37.6200000',
      ]);
      // Second call: sdex leg, amountIn=60, amountOut=57, minAmountOut = 56.43
      expect(proto.swap.mock.calls[1]).toEqual([
        'GUSER',
        'SKEY',
        XLM,
        USDC,
        '60',
        '56.4300000',
      ]);

      // Factory must receive the per-venue protocolId, not the aggregator's
      // base config.
      const venues = factory.createProtocol.mock.calls.map((c) => c[0].protocolId);
      expect(venues).toEqual(['soroswap', 'sdex']);
    });

    it('throws if the venue protocol does not implement swap()', async () => {
      const noSwapProtocol = { initialize: jest.fn().mockResolvedValue(undefined) };
      const aggregator = new DexAggregator(baseConfig, {
        quoteService: {
          getBestQuote: jest.fn().mockResolvedValue(sampleQuote([sampleRoute()])),
        },
        protocolFactory: { createProtocol: jest.fn().mockReturnValue(noSwapProtocol) },
      });

      await expect(
        aggregator.executeBestRoute(XLM, USDC, '100', {
          walletAddress: 'GUSER',
          privateKey: 'SKEY',
        }),
      ).rejects.toThrow(/does not expose a swap/);
    });
  });
});
