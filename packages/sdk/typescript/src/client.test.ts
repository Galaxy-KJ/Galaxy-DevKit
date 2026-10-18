import { GalaxyClient, GalaxyApiError, GalaxyTransportError } from './index';
import type { GalaxyClientOptions } from './types';

const address = `G${'A'.repeat(55)}`;
const quote = { assetIn: 'XLM', assetOut: 'USD:GISSUER&memo=a b', amountIn: '1.0000001' };
const transaction = { hash: 'unsigned-xdr', status: 'pending', ledger: 0, createdAt: '2026-01-01T00:00:00.000Z', metadata: { operation: 'supply' } };
function setup(extra: Partial<GalaxyClientOptions> = {}) {
  const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify(transaction)));
  const client = new GalaxyClient({ baseUrl: 'https://example.test/proxy/', apiKey: 'test-key', fetch: fetcher, ...extra });
  return { client, fetcher };
}

describe('GalaxyClient REST facade', () => {
  test.each(['wallets', 'oracles', 'automation'] as const)('%s explicitly unavailable without network calls', feature => {
    const { client, fetcher } = setup();
    expect(client[feature].available).toBe(false);
    expect(client[feature].reason.length).toBeGreaterThan(0);
    expect(Object.isFrozen(client[feature])).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('Soroswap query encoding and JSON wire responses', async () => {
    const { client, fetcher } = setup();
    const response = { ...quote, tokenIn: { code: 'XLM', type: 'native' }, amountOut: '2', validUntil: '2026-01-01T00:01:00Z' };
    fetcher.mockResolvedValue(new Response(JSON.stringify(response)));
    expect(await client.defi.soroswap.getQuote(quote)).toEqual(response);
    const [url, request] = fetcher.mock.calls[0];
    expect(new URL(url).pathname).toBe('/proxy/api/v1/defi/swap/quote');
    expect(new URL(url).searchParams.get('assetOut')).toBe(quote.assetOut);
    expect(new URL(url).searchParams.has('api_key')).toBe(false);
    expect(request).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit', headers: { 'x-api-key': 'test-key', Accept: 'application/json' } });
    expect(request.headers['Content-Type']).toBeUndefined();
  });

  test.each([undefined, [60, 40] as const])('aggregator best/split query %j', async splits => {
    const { client, fetcher } = setup();
    const response = { totalAmountOut: '99', routes: [], totalPriceImpact: 0 };
    fetcher.mockResolvedValue(new Response(JSON.stringify(response)));
    expect(await client.defi.aggregator.getQuote({ ...quote, splits })).toEqual(response);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/proxy/api/v1/defi/aggregator/quote');
    expect(url.searchParams.get('splits')).toBe(splits ? '60,40' : null);
  });

  test('Blend position keeps serialized values and optional APY', async () => {
    const { client, fetcher } = setup();
    const position = { address, supplied: [], borrowed: [], healthFactor: 'Infinity', collateralValue: '0', debtValue: '0', supplyAPY: '2.5' };
    fetcher.mockResolvedValue(new Response(JSON.stringify(position)));
    expect(await client.defi.blend.getPosition(address)).toEqual(position);
    expect(fetcher.mock.calls[0][0]).toBe(`https://example.test/proxy/api/v1/defi/blend/position/${address}`);
  });

  test.each(['supply', 'withdraw', 'borrow', 'repay'] as const)('Blend %s posts only supported public fields', async method => {
    const { client, fetcher } = setup();
    const input = { asset: 'XLM', amount: '123.1234567', signerPublicKey: address, privateKey: 'MUST-NOT-SEND' };
    expect(await client.defi.blend[method](input)).toEqual(transaction);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe(`https://example.test/proxy/api/v1/defi/blend/${method}`);
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toEqual({ asset: 'XLM', amount: '123.1234567', signerPublicKey: address });
    expect(request.headers['Content-Type']).toBe('application/json');
  });

  test('Soroswap swap, add and remove liquidity use actual handler fields', async () => {
    const { client, fetcher } = setup();
    const swap = { ...quote, minAmountOut: '0.9', signerPublicKey: address };
    const add = { assetA: 'XLM', assetB: 'USD:ISSUER', amountA: '10', amountB: '11', signerPublicKey: address };
    const remove = { assetA: 'XLM', assetB: 'USD:ISSUER', poolAddress: 'CPOOL', lpAmount: '2', signerPublicKey: address, minAmountA: '1', minAmountB: '2' };
    for (const [method, input, route] of [['swap', swap, 'swap'], ['addLiquidity', add, 'liquidity/add'], ['removeLiquidity', remove, 'liquidity/remove']] as const) {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify(transaction)));
      // Separate signatures share the same transport contract under test.
      await (client.defi.soroswap[method] as (value: typeof input) => Promise<unknown>)(input);
      const [url, request] = fetcher.mock.calls.at(-1)!;
      expect(url).toBe(`https://example.test/proxy/api/v1/defi/${route}`);
      expect(JSON.parse(request.body)).toEqual(input);
    }
  });

  test('unauthenticated requests omit API key; redirect and cookies are disabled', async () => {
    const { client, fetcher } = setup({ apiKey: undefined });
    await client.defi.soroswap.getQuote(quote);
    expect(fetcher.mock.calls[0][1].headers['x-api-key']).toBeUndefined();
  });

  test('server errors are typed and mutations are never retried', async () => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'INVALID_API_KEY', message: 'Denied' } }), { status: 401 }));
    await expect(client.defi.blend.supply({ asset: 'XLM', amount: '1', signerPublicKey: address })).rejects.toMatchObject({ name: 'GalaxyApiError', status: 401, code: 'INVALID_API_KEY', message: 'Denied' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test.each([429, 500])('non-JSON HTTP %d error retains status', async status => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValue(new Response('<html>unavailable</html>', { status }));
    await expect(client.defi.soroswap.getQuote(quote)).rejects.toBeInstanceOf(GalaxyApiError);
  });

  test('malformed successful JSON is rejected', async () => {
    const { client, fetcher } = setup();
    fetcher.mockResolvedValue(new Response('not json'));
    await expect(client.defi.soroswap.getQuote(quote)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  test('network errors propagate without retry', async () => {
    const { client, fetcher } = setup();
    const error = new TypeError('network unavailable');
    fetcher.mockRejectedValue(error);
    await expect(client.defi.soroswap.getQuote(quote)).rejects.toBe(error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('timeout aborts fetch and cleans up', async () => {
    const { client, fetcher } = setup({ timeoutMs: 5 });
    fetcher.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    await expect(client.defi.soroswap.getQuote(quote)).rejects.toBeInstanceOf(GalaxyTransportError);
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('caller cancellation works before and during the request', async () => {
    const { client, fetcher } = setup();
    const controller = new AbortController();
    fetcher.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    const pending = client.defi.soroswap.getQuote(quote, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(client.defi.soroswap.getQuote(quote, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('invalid config, traversal and unsupported network fail before HTTP', () => {
    for (const baseUrl of ['relative', 'file:///tmp/api', 'https://user:secret@example.test', 'https://example.test?key=secret', 'https://example.test#fragment']) {
      expect(() => setup({ baseUrl })).toThrow(TypeError);
    }
    for (const timeoutMs of [0, -1, NaN, Infinity, 2 ** 32]) expect(() => setup({ timeoutMs })).toThrow(TypeError);
    expect(() => setup({ apiKey: '\r\nBad: key' })).toThrow(TypeError);
    expect(() => setup({ network: 'mainnet' })).toThrow(/Only testnet/);
    const { client, fetcher } = setup();
    expect(() => client.defi.blend.getPosition('../wallets')).toThrow(TypeError);
    expect(() => client.defi.aggregator.getQuote({ ...quote, splits: [-1, 2] })).toThrow(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
