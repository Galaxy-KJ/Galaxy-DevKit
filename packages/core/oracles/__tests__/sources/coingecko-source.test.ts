/**
 * @fileoverview CoinGeckoSource tests
 */

import { CoinGeckoSource } from '../../src/sources/real/CoinGeckoSource.js';

const makeCgResponse = (coinId: string, price: number) => ({
     [coinId]: { usd: price },
});

const makeOkResponse = (body: unknown): Response =>
     ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => body,
     }) as unknown as Response;

describe('CoinGeckoSource', () => {
     let source: CoinGeckoSource;
     let fetchSpy: jest.SpyInstance;

     beforeEach(() => {
          fetchSpy = jest.spyOn(global, 'fetch');
          source = new CoinGeckoSource();
     });

     afterEach(() => {
          jest.restoreAllMocks();
     });

     // ── constructor ────────────────────────────────────────────────────────────

     describe('constructor', () => {
          it('works without an API key', () => {
               expect(() => new CoinGeckoSource()).not.toThrow();
          });

          it('accepts an optional API key', () => {
               expect(() => new CoinGeckoSource('my-cg-key')).not.toThrow();
          });
     });

     // ── getPrice ───────────────────────────────────────────────────────────────

     describe('getPrice', () => {
          it.each([
               ['XLM', 'stellar', 0.12],
               ['BTC', 'bitcoin', 65000],
               ['ETH', 'ethereum', 3200],
               ['USDC', 'usd-coin', 1.0],
               ['USDT', 'tether', 1.0],
          ])('returns correct price for %s', async (symbol, coinId, expectedPrice) => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse(coinId, expectedPrice)));

               const result = await source.getPrice(symbol);

               expect(result.symbol).toBe(symbol);
               expect(result.price).toBe(expectedPrice);
               expect(result.source).toBe('coingecko');
               expect(result.timestamp).toBeInstanceOf(Date);
               expect(result.metadata?.apiVersion).toBe('v3');
               expect(result.metadata?.coinId).toBe(coinId);
          });

          it('strips quote currency from symbol (XLM/USD -> XLM)', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('stellar', 0.12)));

               const result = await source.getPrice('XLM/USD');

               expect(result.symbol).toBe('XLM');
          });

          it('is case-insensitive for the symbol', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('bitcoin', 65000)));

               const result = await source.getPrice('btc');

               expect(result.symbol).toBe('BTC');
          });

          it('uses coin ID (not ticker) in the request URL', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('stellar', 0.12)));

               await source.getPrice('XLM');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringContaining('ids=stellar'),
                    expect.any(Object),
               );
          });

          it('hits the /simple/price endpoint', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('bitcoin', 65000)));

               await source.getPrice('BTC');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringContaining('/simple/price'),
                    expect.any(Object),
               );
          });

          it('does not send an API key header when none is provided', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('bitcoin', 65000)));

               await source.getPrice('BTC');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                         headers: expect.not.objectContaining({
                              'x-cg-demo-api-key': expect.anything(),
                         }),
                    }),
               );
          });

          it('sends the API key header when a key is provided', async () => {
               const sourceWithKey = new CoinGeckoSource('my-cg-key');
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('bitcoin', 65000)));

               await sourceWithKey.getPrice('BTC');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.any(String),
                    expect.objectContaining({
                         headers: expect.objectContaining({
                              'x-cg-demo-api-key': 'my-cg-key',
                         }),
                    }),
               );
          });

          it('throws for an unsupported symbol', async () => {
               await expect(source.getPrice('UNKNOWN')).rejects.toThrow(/Unsupported symbol/);
               expect(fetchSpy).not.toHaveBeenCalled();
          });

          it('throws when the API returns a non-ok response', async () => {
               fetchSpy.mockResolvedValueOnce({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests',
               } as Response);

               await expect(source.getPrice('BTC')).rejects.toThrow(/CoinGecko API error: 429/);
          });

          it('throws when price is missing from response', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse({ bitcoin: {} }));

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });

          it('throws when price is null', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse({ bitcoin: { usd: null } }));

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });

          it('throws when price is NaN / non-finite', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse({ bitcoin: { usd: NaN } }));

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });
     });

     // ── getPrices ──────────────────────────────────────────────────────────────

     describe('getPrices', () => {
          it('returns prices for all requested symbols in one request', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         stellar: { usd: 0.12 },
                         bitcoin: { usd: 65000 },
                         ethereum: { usd: 3200 },
                    }),
               );

               const results = await source.getPrices(['XLM', 'BTC', 'ETH']);

               expect(results).toHaveLength(3);
               expect(results.map((r) => r.symbol)).toEqual(['XLM', 'BTC', 'ETH']);
               expect(fetchSpy).toHaveBeenCalledTimes(1);
          });

          it('sends all coin IDs as a comma-separated query param', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         stellar: { usd: 0.12 },
                         bitcoin: { usd: 65000 },
                    }),
               );

               await source.getPrices(['XLM', 'BTC']);

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringMatching(/ids=stellar,bitcoin/),
                    expect.any(Object),
               );
          });

          it('skips symbols with invalid prices instead of throwing', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         stellar: { usd: 0.12 },
                         bitcoin: {},
                    }),
               );

               const results = await source.getPrices(['XLM', 'BTC']);

               expect(results).toHaveLength(1);
               expect(results[0].symbol).toBe('XLM');
          });

          it('returns an empty array when no prices are valid', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse({}));

               const results = await source.getPrices(['XLM', 'BTC']);

               expect(results).toHaveLength(0);
          });

          it('throws when the API returns a non-ok response', async () => {
               fetchSpy.mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
               } as Response);

               await expect(source.getPrices(['BTC'])).rejects.toThrow(/CoinGecko API error: 401/);
          });
     });

     // ── getSourceInfo ──────────────────────────────────────────────────────────

     describe('getSourceInfo', () => {
          it('returns correct source metadata', () => {
               const info = source.getSourceInfo();

               expect(info.name).toBe('coingecko');
               expect(info.version).toBe('1.0.0');
               expect(info.supportedSymbols).toContain('XLM');
               expect(info.supportedSymbols).toContain('BTC');
               expect(info.supportedSymbols).toContain('ETH');
               expect(info.supportedSymbols).toContain('USDC');
               expect(info.supportedSymbols).toContain('USDT');
               expect(info.metadata?.apiUrl).toContain('coingecko.com');
          });
     });

     // ── isHealthy ──────────────────────────────────────────────────────────────

     describe('isHealthy', () => {
          it('returns true when BTC price fetch succeeds', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCgResponse('bitcoin', 65000)));

               await expect(source.isHealthy()).resolves.toBe(true);
          });

          it('returns false when fetch throws', async () => {
               fetchSpy.mockRejectedValueOnce(new Error('Network error'));

               await expect(source.isHealthy()).resolves.toBe(false);
          });

          it('returns false when API returns an error status', async () => {
               fetchSpy.mockResolvedValueOnce({
                    ok: false,
                    status: 503,
                    statusText: 'Service Unavailable',
               } as Response);

               await expect(source.isHealthy()).resolves.toBe(false);
          });
     });
});
