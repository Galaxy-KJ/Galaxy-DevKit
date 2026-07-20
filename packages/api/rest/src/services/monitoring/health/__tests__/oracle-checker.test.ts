import { OracleHealthChecker } from '../oracle-checker';

describe('OracleHealthChecker', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  it('is non-critical', () => {
    const checker = new OracleHealthChecker();
    expect(checker.critical).toBe(false);
    expect(checker.name).toBe('oracle-feeds');
  });

  it('returns up with details when no feeds are wired', async () => {
    const checker = new OracleHealthChecker({
      provider: async () => [],
      now: () => now,
    });
    const result = await checker.check();
    expect(result.status).toBe('up');
    expect(result.details).toEqual(expect.objectContaining({ feeds: 0 }));
  });

  it('returns up when every feed is fresh', async () => {
    const checker = new OracleHealthChecker({
      stalenessMs: 60_000,
      provider: async () => [
        { feed: 'XLM/USD', lastUpdatedAt: new Date(now.getTime() - 10_000) },
      ],
      now: () => now,
    });
    const result = await checker.check();
    expect(result.status).toBe('up');
  });

  it('returns degraded when at least one feed exceeds staleness', async () => {
    const checker = new OracleHealthChecker({
      stalenessMs: 60_000,
      provider: async () => [
        { feed: 'XLM/USD', lastUpdatedAt: new Date(now.getTime() - 10_000) },
        { feed: 'USDC/USD', lastUpdatedAt: new Date(now.getTime() - 120_000) },
      ],
      now: () => now,
    });
    const result = await checker.check();
    expect(result.status).toBe('degraded');
    expect(result.details).toEqual(
      expect.objectContaining({ staleFeeds: ['USDC/USD'] })
    );
  });

  it('returns down when the provider throws', async () => {
    const checker = new OracleHealthChecker({
      provider: async () => { throw new Error('feed offline'); },
      now: () => now,
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.message).toBe('feed offline');
  });
});
