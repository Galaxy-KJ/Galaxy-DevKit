/**
 * @fileoverview Comprehensive tests for SDEX Protocol implementation
 * @description Covers order book fetching, path payments, sell offer management,
 *   LiquidityPool mapping, asset matching, and aggregator integration edge cases.
 */

import { SdexProtocol } from '../../src/protocols/sdex/sdex-protocol';
import { ProtocolConfig, ProtocolType, Asset } from '../../src/types/defi-types';
import { InvalidOperationError } from '../../src/errors';
import { Operation } from '@stellar/stellar-sdk';
import {
  assetsMatch,
  assetKey,
  orderBookToLiquidityPool,
  toStellarAsset,
} from '../../src/protocols/sdex/sdex-types';
import type { SdexOrderBook } from '../../src/protocols/sdex/sdex-types';

// ─── Stellar SDK mock ─────────────────────────────────────────────────────────

jest.mock('@stellar/stellar-sdk', () => {
  const original = jest.requireActual('@stellar/stellar-sdk');

  const mockOrderBookCall = jest.fn().mockResolvedValue({
    bids: [
      { price: '0.10', amount: '500.0000000' },
      { price: '0.09', amount: '300.0000000' },
    ],
    asks: [
      { price: '0.11', amount: '400.0000000' },
      { price: '0.12', amount: '200.0000000' },
    ],
  });

  const mockOrderBookLimit = jest.fn().mockReturnValue({ call: mockOrderBookCall });

  return {
    ...original,
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        toXDR: jest.fn().mockReturnValue('mock-xdr-string'),
      }),
    })),
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        ledgers: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            call: jest.fn().mockResolvedValue({}),
          }),
        }),
        loadAccount: jest.fn().mockResolvedValue({
          accountId: () => 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          sequenceNumber: () => '123',
          incrementSequenceNumber: jest.fn(),
        }),
        strictSendPaths: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                source_asset_type: 'native',
                source_amount: '10',
                destination_asset_type: 'credit_alphanum4',
                destination_asset_code: 'USDC',
                destination_asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                destination_amount: '9.5000000',
                path: [
                  { asset_type: 'native' },
                  {
                    asset_type: 'credit_alphanum4',
                    asset_code: 'USDC',
                    asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
                  },
                ],
              },
            ],
          }),
        }),
        orderbook: jest.fn().mockReturnValue({
          limit: mockOrderBookLimit,
          call: mockOrderBookCall,
        }),
      })),
    },
    Operation: {
      pathPaymentStrictSend: jest.fn().mockReturnValue({ type: 'pathPaymentStrictSend' }),
      manageSellOffer: jest.fn().mockReturnValue({ type: 'manageSellOffer' }),
    },
    BASE_FEE: '100',
  };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const TEST_ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const XLM: Asset = { code: 'XLM', type: 'native' };
const USDC: Asset = { code: 'USDC', issuer: ISSUER, type: 'credit_alphanum4' };
const BTC: Asset = {
  code: 'BTC',
  issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM',
  type: 'credit_alphanum4',
};

const mockConfig: ProtocolConfig = {
  protocolId: 'sdex',
  name: 'Stellar DEX',
  network: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  contractAddresses: {},
  metadata: {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createInitializedProtocol(): Promise<SdexProtocol> {
  const p = new SdexProtocol(mockConfig);
  return p.initialize().then(() => p);
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('SdexProtocol – basics', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('initializes successfully and reports initialized=true', () => {
    expect(protocol.isInitialized()).toBe(true);
  });

  it('exposes correct protocol type', () => {
    expect(protocol.type).toBe(ProtocolType.DEX);
  });

  it('exposes correct protocolId and name', () => {
    expect(protocol.protocolId).toBe('sdex');
    expect(protocol.name).toBe('Stellar DEX');
  });

  it('is idempotent: second initialize() is a no-op', async () => {
    const horizonMock = (protocol as any).horizonServer;
    await protocol.initialize();
    // ledgers().limit().call() should have been called exactly once (first init)
    expect(horizonMock.ledgers).toHaveBeenCalledTimes(1);
  });

  it('reports aggregate liquidity-pool depth in getStats()', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            { reserves: [{ amount: '12.5000000' }, { amount: '7.5000000' }] },
          ],
        },
      }),
    } as Response);

    const stats = await protocol.getStats();
    expect(stats.tvl).toBe('20.0000000');
    expect(stats.totalSupply).toBe('20.0000000');
    expect(stats.timestamp).toBeInstanceOf(Date);
    fetchMock.mockRestore();
  });

  it('uses the short-lived stats cache for repeated reads', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ _embedded: { records: [{ reserves: [{ amount: '4' }] }] } }),
    } as Response);

    await protocol.getStats();
    await protocol.getStats();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('follows liquidity-pool pagination and tolerates missing reserve arrays', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: { records: [{ reserves: [{ amount: '2' }] }, {}] },
          _links: { next: { href: 'https://horizon.example/page-2' } },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ _embedded: { records: [{ reserves: [{ amount: '3' }] }] } }),
      } as Response);

    const stats = await protocol.getStats();

    expect(stats.tvl).toBe('5.0000000');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://horizon.example/page-2');
    fetchMock.mockRestore();
  });

  it('propagates a failed liquidity-pool response', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(protocol.getStats()).rejects.toThrow(/liquidity_pools returned 503/i);
    fetchMock.mockRestore();
  });

  it('throws when calling methods before initialize()', async () => {
    const uninit = new SdexProtocol(mockConfig);
    await expect(uninit.getSwapQuote(XLM, USDC, '10')).rejects.toThrow(/not initialized/i);
  });
});

describe('SdexProtocol – unsupported lending operations', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it.each([
    ['supply', () => (protocol as any).supply()],
    ['borrow', () => (protocol as any).borrow()],
    ['repay', () => (protocol as any).repay()],
    ['withdraw', () => (protocol as any).withdraw()],
    ['getPosition', () => (protocol as any).getPosition()],
    ['getHealthFactor', () => (protocol as any).getHealthFactor()],
    ['getSupplyAPY', () => (protocol as any).getSupplyAPY()],
    ['getBorrowAPY', () => (protocol as any).getBorrowAPY()],
    ['getTotalSupply', () => (protocol as any).getTotalSupply()],
    ['getTotalBorrow', () => (protocol as any).getTotalBorrow()],
  ])('%s throws InvalidOperationError', async (_name, fn) => {
    await expect(fn()).rejects.toThrow(InvalidOperationError);
  });
});

describe('SdexProtocol – getSwapQuote()', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('returns a valid quote for XLM → USDC', async () => {
    const quote = await protocol.getSwapQuote(XLM, USDC, '10');

    expect(quote.amountIn).toBe('10');
    expect(quote.amountOut).toBe('9.5000000');
    expect(quote.tokenIn).toEqual(XLM);
    expect(quote.tokenOut).toEqual(USDC);
    expect(quote.minimumReceived).toBe('9.4050000'); // 9.5 * 0.99 = 9.405
    expect(quote.validUntil).toBeInstanceOf(Date);
    expect(quote.validUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('path contains asset identifiers', async () => {
    const quote = await protocol.getSwapQuote(XLM, USDC, '10');
    expect(quote.path).toContain('XLM');
    expect(quote.path.some((p) => p.startsWith('USDC:'))).toBe(true);
  });

  it('applies 1% slippage to derive minimumReceived', async () => {
    const quote = await protocol.getSwapQuote(XLM, USDC, '10');
    const expected = (parseFloat(quote.amountOut) * 0.99).toFixed(7);
    expect(quote.minimumReceived).toBe(expected);
  });

  it('throws when no path is found', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.strictSendPaths.mockReturnValueOnce({
      call: jest.fn().mockResolvedValue({ records: [] }),
    });

    await expect(protocol.getSwapQuote(XLM, USDC, '10')).rejects.toThrow(/No path found/i);
  });

  it('throws when tokenIn === tokenOut (same asset)', async () => {
    await expect(protocol.getSwapQuote(XLM, XLM, '10')).rejects.toThrow(
      /Source and destination assets must be different/,
    );
  });

  it('throws when tokenIn and tokenOut are same non-native asset', async () => {
    const usdcDupe: Asset = { ...USDC };
    await expect(protocol.getSwapQuote(USDC, usdcDupe, '10')).rejects.toThrow(
      /Source and destination assets must be different/,
    );
  });

  it('validates amountIn is positive', async () => {
    await expect(protocol.getSwapQuote(XLM, USDC, '0')).rejects.toThrow();
    await expect(protocol.getSwapQuote(XLM, USDC, '-1')).rejects.toThrow();
  });

  it('handles multi-hop path (intermediate asset)', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.strictSendPaths.mockReturnValueOnce({
      call: jest.fn().mockResolvedValue({
        records: [
          {
            source_asset_type: 'native',
            source_amount: '10',
            destination_asset_type: 'credit_alphanum4',
            destination_asset_code: 'BTC',
            destination_asset_issuer:
              'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM',
            destination_amount: '0.0003000',
            path: [
              { asset_type: 'native' },
              {
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
                asset_issuer: ISSUER,
              },
              {
                asset_type: 'credit_alphanum4',
                asset_code: 'BTC',
                asset_issuer: 'GDPJALI4AZKUU2W426U5WKMAT6CN3AJRPIIRYR2YM54TL2GDWO5O2MZM',
              },
            ],
          },
        ],
      }),
    });

    const quote = await protocol.getSwapQuote(XLM, BTC, '10');
    expect(quote.amountOut).toBe('0.0003000');
    expect(quote.path).toHaveLength(3);
    expect(quote.path[1]).toMatch(/^USDC:/);
  });
});

describe('SdexProtocol – swap()', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('builds an unsigned XDR transaction', async () => {
    const result = await protocol.swap(TEST_ADDRESS, 'SK...', XLM, USDC, '10', '9');

    expect(result.status).toBe('pending');
    expect(result.metadata.xdr).toBe('mock-xdr-string');
  });

  it('calls Operation.pathPaymentStrictSend with correct params', async () => {
    await protocol.swap(TEST_ADDRESS, 'SK...', XLM, USDC, '10', '9.0000000');

    expect(Operation.pathPaymentStrictSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sendAmount: '10',
        destMin: '9.0000000',
        destination: TEST_ADDRESS,
      }),
    );
  });

  it('stores operation metadata in the result', async () => {
    const result = await protocol.swap(TEST_ADDRESS, 'SK...', XLM, USDC, '10', '9');

    expect(result.metadata).toMatchObject({
      operation: 'swap',
      protocol: 'sdex',
      amountIn: '10',
      minAmountOut: '9',
    });
  });

  it('throws for invalid wallet address', async () => {
    await expect(
      protocol.swap('INVALID_ADDRESS', 'SK...', XLM, USDC, '10', '9'),
    ).rejects.toThrow();
  });

  it('propagates getSwapQuote error when no path exists', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.strictSendPaths.mockReturnValueOnce({
      call: jest.fn().mockResolvedValue({ records: [] }),
    });

    await expect(
      protocol.swap(TEST_ADDRESS, 'SK...', XLM, USDC, '10', '9'),
    ).rejects.toThrow(/No path found/i);
  });
});

describe('SdexProtocol – getOrderBook()', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('returns asks and bids with price and amount fields', async () => {
    const ob = await protocol.getOrderBook(XLM, USDC);

    expect(ob.base).toEqual(XLM);
    expect(ob.counter).toEqual(USDC);
    expect(ob.asks).toHaveLength(2);
    expect(ob.bids).toHaveLength(2);
    expect(ob.asks[0]).toMatchObject({ price: '0.11', amount: '400.0000000' });
    expect(ob.bids[0]).toMatchObject({ price: '0.10', amount: '500.0000000' });
  });

  it('includes a Unix timestamp', async () => {
    const before = Date.now();
    const ob = await protocol.getOrderBook(XLM, USDC);
    const after = Date.now();

    expect(ob.timestamp).toBeGreaterThanOrEqual(before);
    expect(ob.timestamp).toBeLessThanOrEqual(after);
  });

  it('passes the limit parameter to Horizon', async () => {
    const horizonMock = (protocol as any).horizonServer;
    await protocol.getOrderBook(XLM, USDC, 5);

    expect(horizonMock.orderbook).toHaveBeenCalled();
    const orderbookObj = horizonMock.orderbook.mock.results[0].value;
    expect(orderbookObj.limit).toHaveBeenCalledWith(5);
  });

  it('throws when base === counter (same native asset)', async () => {
    await expect(protocol.getOrderBook(XLM, XLM)).rejects.toThrow(
      /Base and counter assets must be different/,
    );
  });

  it('throws when base === counter (same non-native asset)', async () => {
    await expect(protocol.getOrderBook(USDC, { ...USDC })).rejects.toThrow(
      /Base and counter assets must be different/,
    );
  });

  it('returns empty arrays when Horizon returns no levels', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.orderbook.mockReturnValueOnce({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
      }),
    });

    const ob = await protocol.getOrderBook(XLM, USDC);
    expect(ob.asks).toHaveLength(0);
    expect(ob.bids).toHaveLength(0);
  });

  it('propagates Horizon errors', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.orderbook.mockReturnValueOnce({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue(new Error('Horizon 503')),
      }),
    });

    await expect(protocol.getOrderBook(XLM, USDC)).rejects.toThrow(/Horizon 503/);
  });
});

describe('SdexProtocol – manageSellOffer()', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('creates a new offer (offerId=0) and returns action="create"', async () => {
    const result = await protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
      selling: XLM,
      buying: USDC,
      amount: '100',
      price: '0.10',
    });

    expect(result.action).toBe('create');
    expect(result.offerId).toBe(0);
    expect(result.xdr).toBe('mock-xdr-string');
  });

  it('modifies an existing offer (offerId > 0, amount > 0) → action="modify"', async () => {
    const result = await protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
      selling: XLM,
      buying: USDC,
      amount: '50',
      price: '0.11',
      offerId: 12345,
    });

    expect(result.action).toBe('modify');
    expect(result.offerId).toBe(12345);
  });

  it('deletes an offer (offerId > 0, amount="0") → action="delete"', async () => {
    const result = await protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
      selling: XLM,
      buying: USDC,
      amount: '0',
      price: '0.10',
      offerId: 99,
    });

    expect(result.action).toBe('delete');
    expect(result.offerId).toBe(99);
  });

  it('calls Operation.manageSellOffer with correct args', async () => {
    await protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
      selling: XLM,
      buying: USDC,
      amount: '100',
      price: '0.10',
      offerId: 0,
    });

    expect(Operation.manageSellOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '100',
        price: '0.10',
        offerId: 0,
      }),
    );
  });

  it('throws when selling === buying (same asset)', async () => {
    await expect(
      protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
        selling: USDC,
        buying: { ...USDC },
        amount: '100',
        price: '1',
      }),
    ).rejects.toThrow(/Selling and buying assets must be different/);
  });

  it('throws when price is zero or negative', async () => {
    await expect(
      protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
        selling: XLM,
        buying: USDC,
        amount: '100',
        price: '0',
      }),
    ).rejects.toThrow(/price must be a positive number/i);

    await expect(
      protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
        selling: XLM,
        buying: USDC,
        amount: '100',
        price: '-1',
      }),
    ).rejects.toThrow(/price must be a positive number/i);
  });

  it('throws when amount is negative', async () => {
    await expect(
      protocol.manageSellOffer(TEST_ADDRESS, 'SK...', {
        selling: XLM,
        buying: USDC,
        amount: '-5',
        price: '0.10',
      }),
    ).rejects.toThrow(/amount must be a non-negative number/i);
  });

  it('throws for an invalid wallet address', async () => {
    await expect(
      protocol.manageSellOffer('BAD_ADDR', 'SK...', {
        selling: XLM,
        buying: USDC,
        amount: '100',
        price: '0.10',
      }),
    ).rejects.toThrow();
  });
});

describe('SdexProtocol – getLiquidityPool()', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('returns a LiquidityPool derived from the order book', async () => {
    const pool = await protocol.getLiquidityPool(XLM, USDC);

    expect(pool.tokenA).toEqual(XLM);
    expect(pool.tokenB).toEqual(USDC);
    expect(pool.address).toMatch(/^sdex:/);
    expect(parseFloat(pool.reserveA)).toBeGreaterThan(0);
    expect(parseFloat(pool.reserveB)).toBeGreaterThan(0);
    expect(parseFloat(pool.totalLiquidity)).toBeGreaterThan(0);
    expect(pool.fee).toBe('0.002');
  });

  it('reserveA equals total ask depth (base asset)', async () => {
    const pool = await protocol.getLiquidityPool(XLM, USDC);
    // asks: 400 + 200 = 600
    expect(parseFloat(pool.reserveA)).toBeCloseTo(600, 4);
  });

  it('reserveB approximates bid depth (counter asset, amount×price)', async () => {
    const pool = await protocol.getLiquidityPool(XLM, USDC);
    // bids: (500 * 0.10) + (300 * 0.09) = 50 + 27 = 77
    expect(parseFloat(pool.reserveB)).toBeCloseTo(77, 4);
  });

  it('throws when tokenA === tokenB', async () => {
    await expect(protocol.getLiquidityPool(XLM, XLM)).rejects.toThrow(
      /tokenA and tokenB must be different/,
    );
  });

  it('returns zero-depth pool when order book is empty', async () => {
    const horizonMock = (protocol as any).horizonServer;
    horizonMock.orderbook.mockReturnValueOnce({
      limit: jest.fn().mockReturnValue({
        call: jest.fn().mockResolvedValue({ bids: [], asks: [] }),
      }),
    });

    const pool = await protocol.getLiquidityPool(XLM, USDC);
    expect(parseFloat(pool.reserveA)).toBe(0);
    expect(parseFloat(pool.reserveB)).toBe(0);
    expect(parseFloat(pool.totalLiquidity)).toBe(0);
  });
});

// ─── sdex-types unit tests ────────────────────────────────────────────────────

describe('assetsMatch()', () => {
  it('matches two native assets', () => {
    expect(assetsMatch(XLM, { code: 'XLM', type: 'native' })).toBe(true);
  });

  it('does not match native vs non-native', () => {
    expect(assetsMatch(XLM, USDC)).toBe(false);
  });

  it('matches same non-native asset (case-insensitive code)', () => {
    const usdcLower: Asset = { code: 'usdc', issuer: ISSUER, type: 'credit_alphanum4' };
    expect(assetsMatch(USDC, usdcLower)).toBe(true);
  });

  it('does not match same code but different issuer', () => {
    const usdcOther: Asset = { code: 'USDC', issuer: 'GDIFFERENT_ISSUER', type: 'credit_alphanum4' };
    expect(assetsMatch(USDC, usdcOther)).toBe(false);
  });

  it('does not match different codes', () => {
    expect(assetsMatch(USDC, BTC)).toBe(false);
  });
});

describe('assetKey()', () => {
  it('returns "native" for XLM', () => {
    expect(assetKey(XLM)).toBe('native');
  });

  it('returns "CODE:ISSUER" for non-native asset', () => {
    expect(assetKey(USDC)).toBe(`USDC:${ISSUER}`);
  });

  it('upper-cases the asset code', () => {
    const lower: Asset = { code: 'usdc', issuer: ISSUER, type: 'credit_alphanum4' };
    expect(assetKey(lower)).toBe(`USDC:${ISSUER}`);
  });
});

describe('toStellarAsset()', () => {
  it('converts native XLM', () => {
    const asset = toStellarAsset({ type: 'native' });
    expect(asset.isNative()).toBe(true);
  });

  it('converts non-native asset with code and issuer', () => {
    const asset = toStellarAsset({ type: 'credit_alphanum4', code: 'USDC', issuer: ISSUER });
    expect(asset.isNative()).toBe(false);
    expect(asset.getCode()).toBe('USDC');
    expect(asset.getIssuer()).toBe(ISSUER);
  });
});

describe('orderBookToLiquidityPool()', () => {
  const sampleOrderBook: SdexOrderBook = {
    base: XLM,
    counter: USDC,
    asks: [
      { price: '0.11', amount: '400.0000000' },
      { price: '0.12', amount: '200.0000000' },
    ],
    bids: [
      { price: '0.10', amount: '500.0000000' },
      { price: '0.09', amount: '300.0000000' },
    ],
    timestamp: 1234567890000,
  };

  it('sets address as sdex:<base_key>_<counter_key>', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    expect(pool.address).toBe(`sdex:native_USDC:${ISSUER}`);
  });

  it('sets tokenA = base, tokenB = counter', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    expect(pool.tokenA).toEqual(XLM);
    expect(pool.tokenB).toEqual(USDC);
  });

  it('calculates reserveA as sum of ask amounts', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    expect(parseFloat(pool.reserveA)).toBeCloseTo(600, 5);
  });

  it('calculates reserveB as sum of bid_amount × bid_price', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    // (500 * 0.10) + (300 * 0.09) = 50 + 27 = 77
    expect(parseFloat(pool.reserveB)).toBeCloseTo(77, 5);
  });

  it('calculates totalLiquidity as geometric mean of reserves', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    const expected = Math.sqrt(600 * 77);
    expect(parseFloat(pool.totalLiquidity)).toBeCloseTo(expected, 3);
  });

  it('sets fee to 0.002', () => {
    const pool = orderBookToLiquidityPool(sampleOrderBook);
    expect(pool.fee).toBe('0.002');
  });

  it('handles empty asks and bids gracefully', () => {
    const empty: SdexOrderBook = { ...sampleOrderBook, asks: [], bids: [] };
    const pool = orderBookToLiquidityPool(empty);
    expect(parseFloat(pool.reserveA)).toBe(0);
    expect(parseFloat(pool.reserveB)).toBe(0);
    expect(parseFloat(pool.totalLiquidity)).toBe(0);
  });
});

// ─── Aggregator integration ───────────────────────────────────────────────────

describe('SdexProtocol – aggregator integration (getSwapQuote is used by DexAggregatorService)', () => {
  let protocol: SdexProtocol;

  beforeEach(async () => {
    jest.clearAllMocks();
    protocol = await createInitializedProtocol();
  });

  it('getSwapQuote returns shape expected by AggregatorRoute', async () => {
    const quote = await protocol.getSwapQuote(XLM, USDC, '100');

    // AggregatorRoute needs: amountOut (string), priceImpact (string|number), path (string[])
    expect(typeof quote.amountOut).toBe('string');
    expect(parseFloat(quote.amountOut)).toBeGreaterThan(0);
    expect(typeof quote.priceImpact).toBe('string');
    expect(Array.isArray(quote.path)).toBe(true);
  });

  it('different amounts produce proportional quotes when Horizon returns scaled values', async () => {
    const horizonMock = (protocol as any).horizonServer;

    horizonMock.strictSendPaths
      .mockReturnValueOnce({
        call: jest.fn().mockResolvedValue({
          records: [{
            source_asset_type: 'native', source_amount: '50',
            destination_asset_type: 'credit_alphanum4',
            destination_asset_code: 'USDC',
            destination_asset_issuer: ISSUER,
            destination_amount: '47.5000000',
            path: [{ asset_type: 'native' }, { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER }],
          }],
        }),
      })
      .mockReturnValueOnce({
        call: jest.fn().mockResolvedValue({
          records: [{
            source_asset_type: 'native', source_amount: '100',
            destination_asset_type: 'credit_alphanum4',
            destination_asset_code: 'USDC',
            destination_asset_issuer: ISSUER,
            destination_amount: '95.0000000',
            path: [{ asset_type: 'native' }, { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER }],
          }],
        }),
      });

    const q50 = await protocol.getSwapQuote(XLM, USDC, '50');
    const q100 = await protocol.getSwapQuote(XLM, USDC, '100');

    expect(parseFloat(q100.amountOut)).toBeCloseTo(
      parseFloat(q50.amountOut) * 2,
      4,
    );
  });

  it('getOrderBook result can be converted to LiquidityPool for depth analysis', async () => {
    const ob = await protocol.getOrderBook(XLM, USDC);
    const pool = orderBookToLiquidityPool(ob);

    expect(pool).toMatchObject({
      tokenA: XLM,
      tokenB: USDC,
      fee: '0.002',
    });
    expect(pool.address).toMatch(/^sdex:/);
  });
});
