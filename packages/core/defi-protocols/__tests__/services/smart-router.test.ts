import {
  SmartRouter,
  findOptimalRoute,
  type SmartRouterQuoteService,
} from '../../src/services/smart-router.js';
import type { AggregatorQuote, AggregatorVenue } from '../../src/aggregator/types.js';
import type { Asset } from '../../src/types/defi-types.js';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4',
};
const EURC: Asset = {
  code: 'EURC',
  issuer: 'GAEURCISSUER',
  type: 'credit_alphanum4',
};
const TEST: Asset = {
  code: 'TEST',
  issuer: 'GATESTISSUER',
  type: 'credit_alphanum4',
};

function quote(
  assetIn: Asset,
  assetOut: Asset,
  amountIn: string,
  amountOut: string,
  venues: AggregatorVenue[] = ['soroswap'],
): AggregatorQuote {
  return {
    assetIn,
    assetOut,
    amountIn,
    totalAmountOut: amountOut,
    effectivePrice: Number(amountOut) / Number(amountIn),
    savingsVsBestSingle: venues.length > 1 ? 1.25 : 0,
    routes: venues.map((venue, index) => ({
      venue,
      amountIn: (Number(amountIn) / venues.length).toFixed(7),
      amountOut: (Number(amountOut) / venues.length).toFixed(7),
      priceImpact: index + 0.1,
      path: [assetIn.code, assetOut.code],
    })),
  };
}

function mockQuoteService(
  outputs: Record<string, string | { amountOut: string; venues: AggregatorVenue[] }>,
): jest.Mocked<SmartRouterQuoteService> {
  return {
    getBestQuote: jest.fn(async (assetIn: Asset, assetOut: Asset, amountIn: string) => {
      const value = outputs[`${assetIn.code}->${assetOut.code}`];
      if (!value) {
        throw new Error(`No liquidity for ${assetIn.code}->${assetOut.code}`);
      }

      if (typeof value === 'string') {
        return quote(assetIn, assetOut, amountIn, value);
      }

      return quote(assetIn, assetOut, amountIn, value.amountOut, value.venues);
    }),
  };
}

describe('SmartRouter service', () => {
  it('finds a multi-hop route that direct basic search misses', async () => {
    const service = mockQuoteService({
      'XLM->TEST': '80',
      'XLM->USDC': '100',
      'USDC->TEST': '95',
    });

    const route = await findOptimalRoute(service, XLM, TEST, '100');

    expect(route.path.map((asset) => asset.code)).toEqual(['XLM', 'USDC', 'TEST']);
    expect(route.hops).toHaveLength(2);
    expect(route.estimatedOutput).toBe('95.0000000');
  });

  it('accounts for gas costs when ranking candidate paths', async () => {
    const service = mockQuoteService({
      'XLM->TEST': '91',
      'XLM->USDC': '100',
      'USDC->TEST': '90',
    });
    const router = new SmartRouter(service, { gasCostInOutputAsset: '1' });

    const route = await router.findOptimalRoute(XLM, TEST, '100');

    expect(route.path.map((asset) => asset.code)).toEqual(['XLM', 'TEST']);
    expect(route.estimatedOutput).toBe('90.0000000');
    expect(route.totalGasCost).toBe('1.0000000');
  });

  it('preserves split execution legs from the aggregator quote', async () => {
    const service = mockQuoteService({
      'XLM->TEST': {
        amountOut: '120',
        venues: ['soroswap', 'sdex'],
      },
    });

    const route = await findOptimalRoute(service, XLM, TEST, '100', 1);

    expect(route.hops[0].venue).toBe('soroswap+sdex');
    expect(route.hops[0].quote.routes).toHaveLength(2);
    expect(route.totalFeePercent).toBe(0.6);
  });

  it('does not create cyclical routes while exploring transit assets', async () => {
    const service = mockQuoteService({
      'XLM->TEST': '70',
      'XLM->USDC': '90',
      'USDC->TEST': '95',
      'XLM->EURC': '100',
      'EURC->USDC': '110',
      'USDC->EURC': '110',
      'EURC->TEST': '80',
    });
    const router = new SmartRouter(service, { transitAssets: [USDC, EURC] });

    const route = await router.findOptimalRoute(XLM, TEST, '100', 3);

    expect(new Set(route.path.map((asset) => asset.code)).size).toBe(route.path.length);
    expect(route.path[0]).toBe(XLM);
    expect(route.path[route.path.length - 1]).toBe(TEST);
  });

  it('rejects non-positive input amounts', async () => {
    const router = new SmartRouter(mockQuoteService({}));

    await expect(router.findOptimalRoute(XLM, TEST, '0')).rejects.toThrow(
      'Amount must be a positive number',
    );
  });
});
