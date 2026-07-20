import { SystemHealthChecker } from '../system-checker';

describe('SystemHealthChecker', () => {
  it('returns up when metrics are within watermarks', async () => {
    const checker = new SystemHealthChecker({
      sampler: () => ({ rssBytes: 100, heapUsedBytes: 50, eventLoopLagMs: 5 }),
      memoryHighWatermarkBytes: 1_000,
      eventLoopLagHighMs: 50,
    });
    const result = await checker.check();
    expect(result.status).toBe('up');
    expect(result.details).toEqual(
      expect.objectContaining({ rssBytes: 100, eventLoopLagMs: 5 })
    );
  });

  it('reports degraded when memory crosses the watermark', async () => {
    const checker = new SystemHealthChecker({
      sampler: () => ({ rssBytes: 2_000, heapUsedBytes: 1_500, eventLoopLagMs: 5 }),
      memoryHighWatermarkBytes: 1_000,
      eventLoopLagHighMs: 50,
    });
    const result = await checker.check();
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('rss above watermark');
  });

  it('reports degraded when event loop lag crosses the watermark', async () => {
    const checker = new SystemHealthChecker({
      sampler: () => ({ rssBytes: 100, heapUsedBytes: 50, eventLoopLagMs: 500 }),
      memoryHighWatermarkBytes: 1_000,
      eventLoopLagHighMs: 100,
    });
    const result = await checker.check();
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('event loop lag');
  });
});
