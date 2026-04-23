/**
 * @fileoverview Tests for OraclePusherService
 * @description Unit tests covering price fetching, scaling, retry logic,
 *   and the full push cycle.
 */

import { OraclePusherService } from '../src/services/OraclePusherService.js';
import type { OraclePusherConfig } from '../src/types/oracle-pusher.types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @stellar/stellar-sdk so we don't need a live Soroban node
jest.mock('@stellar/stellar-sdk', () => {
  const mockSendResult = { status: 'PENDING', hash: 'mock-tx-hash' };
  const mockGetResult = { status: 'SUCCESS' };
  const mockSimResult = { results: [{}], transactionData: {}, minResourceFee: '100' };

  class MockRpcServer {
    getAccount = jest.fn().mockResolvedValue({
      accountId: () => 'GDTEST...',
      sequence: '1',
      incrementSequenceNumber: jest.fn(),
    });
    simulateTransaction = jest.fn().mockResolvedValue(mockSimResult);
    sendTransaction = jest.fn().mockResolvedValue(mockSendResult);
    getTransaction = jest.fn().mockResolvedValue(mockGetResult);
  }

  const mockTx = {
    sign: jest.fn(),
    toXDR: jest.fn().mockReturnValue('mock-xdr'),
  };

  const mockTxBuilder = {
    addOperation: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue(mockTx),
  };

  return {
    Contract: jest.fn().mockImplementation(() => ({
      call: jest.fn().mockReturnValue('mock-op'),
    })),
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: () => 'GDTEST...',
        sign: jest.fn(),
      }),
    },
    nativeToScVal: jest.fn().mockReturnValue('mock-sc-val'),
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    rpc: {
      Server: MockRpcServer,
      Api: {
        isSimulationError: jest.fn().mockReturnValue(false),
        GetTransactionStatus: { NOT_FOUND: 'NOT_FOUND', SUCCESS: 'SUCCESS', FAILED: 'FAILED' },
      },
      assembleTransaction: jest.fn().mockReturnValue({ build: jest.fn().mockReturnValue(mockTx) }),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => mockTxBuilder),
    xdr: {
      ScVal: {
        scvSymbol: jest.fn((s: string) => `sym:${s}`),
      },
    },
  };
});

// Mock global fetch for CoinGecko calls
const mockCoinGeckoResponse = (price: number, baseId = 'stellar', quoteId = 'usd-coin') =>
  Promise.resolve({
    ok: true,
    json: async () => ({ [baseId]: { [quoteId]: price } }),
    status: 200,
    statusText: 'OK',
  } as any);

global.fetch = jest.fn().mockImplementation(() => mockCoinGeckoResponse(0.123456));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG: OraclePusherConfig = {
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  oracleContractId: 'CA_MOCK_ORACLE',
  pusherSecretKey: 'SCZANGBA5AKIA4LKEMABENTMHALKHI22XDPBXO7BCFPAB2SSWIB75YIQL',
  pairs: [
    {
      base: 'XLM',
      quote: 'USDC',
      providerBaseId: 'stellar',
      providerQuoteId: 'usd-coin',
    },
  ],
  provider: 'coingecko',
  intervalMs: 60_000,
  maxRetries: 3,
  retryDelayMs: 10, // short delay for tests
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OraclePusherService', () => {
  let pusher: OraclePusherService;

  beforeEach(() => {
    pusher = new OraclePusherService(BASE_CONFIG);
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation(() => mockCoinGeckoResponse(0.123456));
  });

  afterEach(() => {
    pusher.stop();
  });

  // -------------------------------------------------------------------------
  describe('scalePrice', () => {
    it('scales a 7-decimal price correctly', () => {
      expect(pusher.scalePrice(1.2345678)).toBe(1_234_568n);
    });

    it('scales price of 1.0 to 1_000_000', () => {
      expect(pusher.scalePrice(1.0)).toBe(1_000_000n);
    });

    it('scales a very small price correctly', () => {
      expect(pusher.scalePrice(0.000001)).toBe(1n);
    });

    it('returns 0n for price 0', () => {
      expect(pusher.scalePrice(0)).toBe(0n);
    });
  });

  // -------------------------------------------------------------------------
  describe('fetchFromCoinGecko', () => {
    it('fetches and returns the correct price', async () => {
      const pair = BASE_CONFIG.pairs[0];
      const result = await pusher.fetchFromCoinGecko(pair);

      expect(result.price).toBeCloseTo(0.123456);
      expect(result.pairKey).toBe('XLM_USDC');
      expect(result.provider).toBe('coingecko');
      expect(result.fetchedAt).toBeInstanceOf(Date);
    });

    it('throws when the API returns a non-ok status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const pair = BASE_CONFIG.pairs[0];
      await expect(pusher.fetchFromCoinGecko(pair)).rejects.toThrow('CoinGecko request failed');
    });

    it('throws when the API returns no price for the requested pair', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}), // empty response
      });

      const pair = BASE_CONFIG.pairs[0];
      await expect(pusher.fetchFromCoinGecko(pair)).rejects.toThrow('returned no price');
    });
  });

  // -------------------------------------------------------------------------
  describe('pushPair', () => {
    it('returns a successful PushResult on first attempt', async () => {
      const result = await pusher.pushPair(BASE_CONFIG.pairs[0]);

      expect(result.success).toBe(true);
      expect(result.pairKey).toBe('XLM_USDC');
      expect(result.txHash).toBe('mock-tx-hash');
      expect(result.attempts).toBe(1);
      expect(result.scaledPrice).toBeGreaterThan(0n);
    });

    it('retries on failure and eventually succeeds', async () => {
      // First two fetch calls fail, third succeeds
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockImplementationOnce(() => mockCoinGeckoResponse(0.5));

      const result = await pusher.pushPair(BASE_CONFIG.pairs[0]);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('returns failure after exhausting all retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Persistent failure'));

      const result = await pusher.pushPair(BASE_CONFIG.pairs[0]);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(BASE_CONFIG.maxRetries);
      expect(result.error).toContain('Persistent failure');
    });
  });

  // -------------------------------------------------------------------------
  describe('runCycle', () => {
    it('returns a PushCycleSummary with correct counts on success', async () => {
      const summary = await pusher.runCycle();

      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(0);
      expect(summary.results.length).toBe(1);
      expect(summary.cycleAt).toBeInstanceOf(Date);
    });

    it('records failures in the summary when push fails', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Down'));

      const summary = await pusher.runCycle();

      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  describe('start / stop', () => {
    it('isRunning returns false before start()', () => {
      expect(pusher.isRunning).toBe(false);
    });

    it('isRunning returns true after start()', async () => {
      await pusher.start();
      expect(pusher.isRunning).toBe(true);
    });

    it('isRunning returns false after stop()', async () => {
      await pusher.start();
      pusher.stop();
      expect(pusher.isRunning).toBe(false);
    });

    it('calling start() twice does not start a second interval', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await pusher.start();
      await pusher.start(); // should be a no-op
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Already running'));
      warnSpy.mockRestore();
    });
  });
});
