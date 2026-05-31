/**
 * AquariusAdapter tests (#273).
 */

import { AquariusAdapter } from '../../src/aggregator/AquariusAdapter';
import { Asset } from '../../src/types/defi-types';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AquariusAdapter (#273)', () => {
  it('maps the Aquarius response to an AggregatorRoute with venue=aquarius', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        amount_out: '1234.5670000',
        price_impact: '0.01',
        path: ['poolA', 'poolB'],
      }),
    );

    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const route = await adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '1000' });

    expect(route.venue).toBe('aquarius');
    expect(route.amountIn).toBe('1000');
    expect(route.amountOut).toBe('1234.5670000');
    expect(route.priceImpact).toBeCloseTo(0.01);
    expect(route.path).toEqual(['poolA', 'poolB']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws when the Aquarius endpoint returns a non-2xx', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' }),
    ).rejects.toThrow(/Aquarius quote endpoint returned 502/);
  });

  it('throws when the response is missing amount_out', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ price_impact: 0 }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' }),
    ).rejects.toThrow(/missing amount_out/);
  });

  it('honours the injected baseUrl in the request URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ amount_out: '1' }));
    const adapter = new AquariusAdapter({
      baseUrl: 'https://amm-staging.example',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' });
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url.startsWith('https://amm-staging.example/quote?')).toBe(true);
  });

  it('throws when amount_out is a non-positive numeric string', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ amount_out: '0' }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' }),
    ).rejects.toThrow(/invalid amount_out/);
  });

  it('throws when amount_out is non-finite (NaN string)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ amount_out: 'NaN' }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(
      adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' }),
    ).rejects.toThrow(/invalid amount_out/);
  });

  it('falls back to priceImpact=0 when price_impact is missing or non-numeric', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ amount_out: '5' }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const route = await adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' });
    expect(route.priceImpact).toBe(0);
    expect(route.path).toEqual([]);
  });

  it('coerces numeric price_impact passed as a number', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ amount_out: '5', price_impact: 0.025 }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const route = await adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' });
    expect(route.priceImpact).toBe(0.025);
  });

  it('coerces a non-numeric price_impact string to 0', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse({ amount_out: '5', price_impact: 'not-a-number' }));
    const adapter = new AquariusAdapter({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const route = await adapter.fetchRoute({ assetIn: XLM, assetOut: USDC, amountIn: '100' });
    expect(route.priceImpact).toBe(0);
  });
});
