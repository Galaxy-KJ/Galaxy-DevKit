/**
 * @fileoverview Unit tests for VolumeTrigger
 */

import {
  VolumeTrigger,
  HorizonFetcher,
  HorizonTradesPage,
} from '../triggers/volume-trigger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const POOL_ID = 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd';
const NOW = new Date('2024-06-01T12:00:00.000Z').getTime();

/** Build a mock trade whose ledger_close_time is `offsetMs` before NOW. */
function mockTrade(baseAmount: string, offsetMs = 0): HorizonTradesPage['_embedded']['records'][0] {
  return {
    ledger_close_time: new Date(NOW - offsetMs).toISOString(),
    base_amount: baseAmount,
    counter_amount: '1.0000000',
    trade_type: 'liquidity_pool',
  };
}

/** Build a full HorizonTradesPage from an array of trade records. */
function mockPage(
  records: HorizonTradesPage['_embedded']['records'],
): HorizonTradesPage {
  return { _embedded: { records } };
}

/** Create a mock HorizonFetcher that returns the given page. */
function mockFetcher(page: HorizonTradesPage): jest.Mocked<HorizonFetcher> {
  return { fetchTrades: jest.fn().mockResolvedValue(page) };
}

/** Create a VolumeTrigger with a mock fetcher and a fixed clock. */
function makeTrigger(
  page: HorizonTradesPage,
  windowMs = 86_400_000,
): { trigger: VolumeTrigger; fetcher: jest.Mocked<HorizonFetcher> } {
  const fetcher = mockFetcher(page);
  const trigger = new VolumeTrigger({ windowMs }, fetcher);
  return { trigger, fetcher };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VolumeTrigger', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ── trackPoolVolume (spec method) ──────────────────────────────────────────

  describe('trackPoolVolume', () => {
    it('returns true when 24h volume exceeds threshold', async () => {
      const { trigger } = makeTrigger(
        mockPage([
          mockTrade('300.0000000', 1_000),
          mockTrade('250.0000000', 2_000),
        ]),
      );

      const result = await trigger.trackPoolVolume(POOL_ID, '500');
      expect(result).toBe(true); // 550 > 500
    });

    it('returns false when 24h volume is below threshold', async () => {
      const { trigger } = makeTrigger(
        mockPage([
          mockTrade('100.0000000', 1_000),
          mockTrade('50.0000000',  2_000),
        ]),
      );

      const result = await trigger.trackPoolVolume(POOL_ID, '500');
      expect(result).toBe(false); // 150 < 500
    });

    it('returns false when volume exactly equals threshold (strict greater-than)', async () => {
      const { trigger } = makeTrigger(
        mockPage([mockTrade('500.0000000', 1_000)]),
      );

      const result = await trigger.trackPoolVolume(POOL_ID, '500');
      expect(result).toBe(false); // 500 is NOT > 500
    });

    it('returns false when there are no trades', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      const result = await trigger.trackPoolVolume(POOL_ID, '0');
      expect(result).toBe(false); // 0 is NOT > 0
    });
  });

  // ── check (extended diagnostics) ──────────────────────────────────────────

  describe('check', () => {
    it('returns correct volume24h and tradeCount', async () => {
      const { trigger } = makeTrigger(
        mockPage([
          mockTrade('100.0000000', 1_000),
          mockTrade('200.0000000', 2_000),
          mockTrade('300.0000000', 3_000),
        ]),
      );

      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '0' });

      expect(result.volume24h).toBeCloseTo(600, 5);
      expect(result.tradeCount).toBe(3);
      expect(result.triggered).toBe(true);
    });

    it('excludes trades outside the rolling window', async () => {
      const WINDOW_MS = 3_600_000; // 1 hour
      const fetcher = mockFetcher(
        mockPage([
          mockTrade('1000.0000000', 500_000),       // 8.3 min ago — inside
          mockTrade('1000.0000000', 7_200_000),     // 2 hours ago — outside
          mockTrade('1000.0000000', 3_600_001),     // just outside
        ]),
      );
      const trigger = new VolumeTrigger({ windowMs: WINDOW_MS }, fetcher);

      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '0' });

      expect(result.tradeCount).toBe(1);
      expect(result.volume24h).toBeCloseTo(1000, 5);
    });

    it('returns checkedAt as an ISO-8601 string', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '0' });
      expect(() => new Date(result.checkedAt)).not.toThrow();
      expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('returns the threshold value in the result', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '12345' });
      expect(result.threshold).toBe(12345);
    });

    it('handles trades with non-numeric base_amount gracefully', async () => {
      const { trigger } = makeTrigger(
        mockPage([
          mockTrade('100.0000000', 1_000),
          { ledger_close_time: new Date(NOW - 2_000).toISOString(), base_amount: 'NaN', counter_amount: '1' },
          { ledger_close_time: new Date(NOW - 3_000).toISOString(), base_amount: 'invalid', counter_amount: '1' },
        ]),
      );

      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '0' });
      expect(result.volume24h).toBeCloseTo(100, 5);
      expect(result.tradeCount).toBe(3); // all 3 pass the time filter
    });
  });

  // ── Horizon URL construction ───────────────────────────────────────────────

  describe('Horizon URL', () => {
    it('calls fetchTrades with a URL containing the pool ID', async () => {
      const { trigger, fetcher } = makeTrigger(mockPage([]));
      await trigger.trackPoolVolume(POOL_ID, '0');
      const url: string = (fetcher.fetchTrades as jest.Mock).mock.calls[0][0];
      expect(url).toContain(POOL_ID);
    });

    it('includes trade_type=liquidity_pool in the URL', async () => {
      const { trigger, fetcher } = makeTrigger(mockPage([]));
      await trigger.trackPoolVolume(POOL_ID, '0');
      const url: string = (fetcher.fetchTrades as jest.Mock).mock.calls[0][0];
      expect(url).toContain('trade_type=liquidity_pool');
    });

    it('uses a custom horizonUrl when provided', async () => {
      const fetcher = mockFetcher(mockPage([]));
      const trigger = new VolumeTrigger(
        { horizonUrl: 'https://horizon-testnet.stellar.org' },
        fetcher,
      );
      await trigger.trackPoolVolume(POOL_ID, '0');
      const url: string = (fetcher.fetchTrades as jest.Mock).mock.calls[0][0];
      expect(url).toContain('horizon-testnet.stellar.org');
    });
  });

  // ── Input validation ───────────────────────────────────────────────────────

  describe('input validation', () => {
    it('throws for a non-numeric threshold', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      await expect(
        trigger.check({ poolId: POOL_ID, threshold24h: 'not-a-number' }),
      ).rejects.toThrow('threshold24h must be a non-negative numeric string');
    });

    it('throws for a negative threshold', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      await expect(
        trigger.check({ poolId: POOL_ID, threshold24h: '-1' }),
      ).rejects.toThrow('threshold24h must be a non-negative numeric string');
    });

    it('throws for an empty poolId', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      await expect(
        trigger.check({ poolId: '', threshold24h: '100' }),
      ).rejects.toThrow('poolId must be a non-empty string');
    });

    it('throws for a whitespace-only poolId', async () => {
      const { trigger } = makeTrigger(mockPage([]));
      await expect(
        trigger.check({ poolId: '   ', threshold24h: '100' }),
      ).rejects.toThrow('poolId must be a non-empty string');
    });

    it('accepts a threshold of zero', async () => {
      const { trigger } = makeTrigger(
        mockPage([mockTrade('0.0000001', 1_000)]),
      );
      // Any positive volume should trigger against threshold=0
      const result = await trigger.check({ poolId: POOL_ID, threshold24h: '0' });
      expect(result.triggered).toBe(true);
    });
  });

  // ── Fetcher error propagation ──────────────────────────────────────────────

  describe('error propagation', () => {
    it('propagates Horizon fetch errors', async () => {
      const fetcher: jest.Mocked<HorizonFetcher> = {
        fetchTrades: jest.fn().mockRejectedValue(new Error('Horizon 503')),
      };
      const trigger = new VolumeTrigger({}, fetcher);
      await expect(
        trigger.trackPoolVolume(POOL_ID, '100'),
      ).rejects.toThrow('Horizon 503');
    });
  });
});