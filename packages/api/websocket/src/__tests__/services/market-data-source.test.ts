import {
  HORIZON_SOURCE,
  ORACLE_SOURCE,
  OracleHorizonMarketDataSource,
  parseHorizonAsset,
  pairFromMarketRoom,
  splitPair,
  toOrderbookRoom,
  toTickerRoom,
} from '../../services/market-data-source';

const PAIR = 'XLM/USDC';
const UPSTREAM = new Date('2026-08-16T12:00:00.000Z');

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('market room helpers', () => {
  it('encodes and decodes ticker and orderbook rooms', () => {
    expect(toTickerRoom(PAIR)).toBe('market:XLM_USDC');
    expect(toOrderbookRoom(PAIR)).toBe('market:XLM_USDC:orderbook');
    expect(pairFromMarketRoom('market:XLM_USDC')).toEqual({ pair: PAIR, kind: 'ticker' });
    expect(pairFromMarketRoom('market:XLM_USDC:orderbook')).toEqual({
      pair: PAIR,
      kind: 'orderbook',
    });
  });

  it('rejects invalid pairs', () => {
    expect(() => splitPair('XLM')).toThrow('Invalid trading pair');
  });

  it('maps well-known and explicit Stellar assets', () => {
    expect(parseHorizonAsset('XLM')).toEqual({ asset_type: 'native' });
    expect(parseHorizonAsset('USDC', 'mainnet')).toEqual({
      asset_type: 'credit_alphanum4',
      asset_code: 'USDC',
      asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    });
    expect(() => parseHorizonAsset('BTC')).toThrow(/CODE:ISSUER/);
  });
});

describe('OracleHorizonMarketDataSource', () => {
  it('returns the oracle aggregator price and timestamp verbatim', async () => {
    const getAggregatedPrice = jest.fn().mockResolvedValue({
      symbol: PAIR,
      price: 0.12,
      timestamp: UPSTREAM,
      sourcesUsed: ['coingecko', 'coinmarketcap'],
      metadata: { volume: 1500, change24h: 2.5, marketCap: 9000 },
    });
    const source = new OracleHorizonMarketDataSource(
      { getAggregatedPrice },
      { horizonUrl: 'https://horizon.test', fetchImpl: jest.fn() }
    );

    await expect(source.getPrice(PAIR)).resolves.toEqual({
      pair: PAIR,
      price: 0.12,
      volume: 1500,
      change24h: 2.5,
      marketCap: 9000,
      source: ORACLE_SOURCE,
      sourcesUsed: ['coingecko', 'coinmarketcap'],
      upstreamTimestamp: UPSTREAM.getTime(),
    });
    expect(getAggregatedPrice).toHaveBeenCalledWith(PAIR);
  });

  it('maps Horizon orderbook levels to numeric tuples', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        bids: [{ price: '0.1100000', amount: '10.0000000' }],
        asks: [{ price: '0.1300000', amount: '8.0000000' }],
      })
    );
    const source = new OracleHorizonMarketDataSource(
      { getAggregatedPrice: jest.fn() },
      { horizonUrl: 'https://horizon.test', fetchImpl }
    );

    const snapshot = await source.getOrderbook(PAIR);
    expect(snapshot).toMatchObject({
      pair: PAIR,
      bids: [[0.11, 10]],
      asks: [[0.13, 8]],
      depth: 1,
      source: HORIZON_SOURCE,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://horizon.test/order_book?'),
      expect.any(Object)
    );
  });

  it('maps the latest Horizon trade without inventing fields', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({
        _embedded: {
          records: [
            {
              ledger_close_time: UPSTREAM.toISOString(),
              base_amount: '5.0000000',
              counter_amount: '0.6000000',
              base_is_seller: true,
              price: { n: 12, d: 100 },
            },
          ],
        },
      })
    );
    const source = new OracleHorizonMarketDataSource(
      { getAggregatedPrice: jest.fn() },
      { horizonUrl: 'https://horizon.test', fetchImpl }
    );

    await expect(source.getLatestTrade(PAIR)).resolves.toEqual({
      pair: PAIR,
      price: 0.12,
      volume: 5,
      side: 'sell',
      tradeTimestamp: UPSTREAM.getTime(),
      source: HORIZON_SOURCE,
      upstreamTimestamp: UPSTREAM.getTime(),
    });
  });

  it('throws when Horizon has no trades instead of fabricating one', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ _embedded: { records: [] } }));
    const source = new OracleHorizonMarketDataSource(
      { getAggregatedPrice: jest.fn() },
      { horizonUrl: 'https://horizon.test', fetchImpl }
    );

    await expect(source.getLatestTrade(PAIR)).rejects.toThrow('No Horizon trades found');
  });

  it('throws on Horizon HTTP errors', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    const source = new OracleHorizonMarketDataSource(
      { getAggregatedPrice: jest.fn() },
      { horizonUrl: 'https://horizon.test', fetchImpl }
    );

    await expect(source.getOrderbook(PAIR)).rejects.toThrow('Horizon request failed (404)');
  });
});
