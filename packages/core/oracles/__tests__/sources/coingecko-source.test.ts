/**
 * @fileoverview CoinMarketCapSource tests
 */

import { CoinMarketCapSource } from '../../src/sources/real/CoinMarketCapSource.js';

const makeCmcResponse = (symbol: string, price: number) => ({
     data: {
          [symbol]: {
               quote: {
                    USD: { price },
               },
          },
     },
});

const makeOkResponse = (body: unknown): Response =>
     ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => body,
     }) as unknown as Response;

describe('CoinMarketCapSource', () => {
     let source: CoinMarketCapSource;
     let fetchSpy: jest.SpyInstance;

     beforeEach(() => {
          fetchSpy = jest.spyOn(global, 'fetch');
          source = new CoinMarketCapSource('test-api-key');
     });

     afterEach(() => {
          jest.restoreAllMocks();
     });

     // ── constructor ────────────────────────────────────────────────────────────

     describe('constructor', () => {
          it('accepts an explicit API key', () => {
               expect(() => new CoinMarketCapSource('my-key')).not.toThrow();
          });


     });

     // ── getPrice ───────────────────────────────────────────────────────────────

     describe('getPrice', () => {
          it.each([
               ['XLM', 0.12],
               ['BTC', 65000],
               ['ETH', 3200],
               ['USDC', 1.0],
               ['USDT', 1.0],
          ])('returns correct price for %s', async (symbol, expectedPrice) => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse(symbol, expectedPrice)));

               const result = await source.getPrice(symbol);

               expect(result.symbol).toBe(symbol);
               expect(result.price).toBe(expectedPrice);
               expect(result.source).toBe('coinmarketcap');
               expect(result.timestamp).toBeInstanceOf(Date);
               expect(result.metadata?.apiVersion).toBe('v1');
          });

          it('strips quote currency from symbol (XLM/USD -> XLM)', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse('XLM', 0.12)));

               const result = await source.getPrice('XLM/USD');

               expect(result.symbol).toBe('XLM');
          });

          it('is case-insensitive for the symbol', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse('BTC', 65000)));

               const result = await source.getPrice('btc');

               expect(result.symbol).toBe('BTC');
          });

          it('sends the correct CMC API key header', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse('BTC', 65000)));

               await source.getPrice('BTC');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringContaining('/cryptocurrency/quotes/latest'),
                    expect.objectContaining({
                         headers: expect.objectContaining({
                              'X-CMC_PRO_API_KEY': 'test-api-key',
                         }),
                    }),
               );
          });

          it('includes symbol in the request URL', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse('XLM', 0.12)));

               await source.getPrice('XLM');

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringContaining('symbol=XLM'),
                    expect.any(Object),
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

               await expect(source.getPrice('BTC')).rejects.toThrow(/CoinMarketCap API error: 429/);
          });

          it('throws when price is missing from response', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({ data: { BTC: { quote: { USD: {} } } } }),
               );

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });

          it('throws when price is null', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({ data: { BTC: { quote: { USD: { price: null } } } } }),
               );

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });

          it('throws when price is NaN / non-finite', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({ data: { BTC: { quote: { USD: { price: NaN } } } } }),
               );

               await expect(source.getPrice('BTC')).rejects.toThrow(/Invalid price data/);
          });
     });

     // ── getPrices ──────────────────────────────────────────────────────────────

     describe('getPrices', () => {
          it('returns prices for all requested symbols in one request', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         data: {
                              XLM: { quote: { USD: { price: 0.12 } } },
                              BTC: { quote: { USD: { price: 65000 } } },
                              ETH: { quote: { USD: { price: 3200 } } },
                         },
                    }),
               );

               const results = await source.getPrices(['XLM', 'BTC', 'ETH']);

               expect(results).toHaveLength(3);
               expect(results.map((r) => r.symbol)).toEqual(['XLM', 'BTC', 'ETH']);
               expect(fetchSpy).toHaveBeenCalledTimes(1);
          });

          it('sends all symbols as a comma-separated query param', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         data: {
                              XLM: { quote: { USD: { price: 0.12 } } },
                              BTC: { quote: { USD: { price: 65000 } } },
                         },
                    }),
               );

               await source.getPrices(['XLM', 'BTC']);

               expect(fetchSpy).toHaveBeenCalledWith(
                    expect.stringMatching(/symbol=XLM,BTC/),
                    expect.any(Object),
               );
          });

          it('skips symbols with invalid prices instead of throwing', async () => {
               fetchSpy.mockResolvedValueOnce(
                    makeOkResponse({
                         data: {
                              XLM: { quote: { USD: { price: 0.12 } } },
                              BTC: { quote: { USD: {} } },
                         },
                    }),
               );

               const results = await source.getPrices(['XLM', 'BTC']);

               expect(results).toHaveLength(1);
               expect(results[0].symbol).toBe('XLM');
          });

          it('returns an empty array when no prices are valid', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse({ data: {} }));

               const results = await source.getPrices(['XLM', 'BTC']);

               expect(results).toHaveLength(0);
          });

          it('throws when the API returns a non-ok response', async () => {
               fetchSpy.mockResolvedValueOnce({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
               } as Response);

               await expect(source.getPrices(['BTC'])).rejects.toThrow(/CoinMarketCap API error: 401/);
          });
     });

     // ── getSourceInfo ──────────────────────────────────────────────────────────

     describe('getSourceInfo', () => {
          it('returns correct source metadata', () => {
               const info = source.getSourceInfo();

               expect(info.name).toBe('coinmarketcap');
               expect(info.version).toBe('1.0.0');
               expect(info.supportedSymbols).toContain('XLM');
               expect(info.supportedSymbols).toContain('BTC');
               expect(info.supportedSymbols).toContain('ETH');
               expect(info.supportedSymbols).toContain('USDC');
               expect(info.supportedSymbols).toContain('USDT');
               expect(info.metadata?.apiUrl).toContain('coinmarketcap.com');
          });
     });

     // ── isHealthy ──────────────────────────────────────────────────────────────

     describe('isHealthy', () => {
          it('returns true when BTC price fetch succeeds', async () => {
               fetchSpy.mockResolvedValueOnce(makeOkResponse(makeCmcResponse('BTC', 65000)));

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