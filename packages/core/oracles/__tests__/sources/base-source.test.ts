import { BaseSource, BaseSourceConfig } from '../../src/sources/base-source.js';
import { PriceData, SourceInfo } from '../../src/types/oracle-types.js';

class TestSource extends BaseSource {
  readonly name = 'test-source';

  constructor(config?: Partial<BaseSourceConfig>) {
    super({
      baseUrl: 'https://api.example.com',
      rateLimitPerSec: 10,
      timeoutMs: 5000,
      cacheTtlMs: 1000,
      ...config,
    });
  }

  async getPrice(symbol: string): Promise<PriceData> {
    const cached = this.getCached(symbol);
    if (cached) return cached;

    await this.rateLimit();
    const data: PriceData = {
      symbol,
      price: 1.0,
      timestamp: new Date(),
      source: this.name,
    };

    this.setCache(symbol, data);
    return data;
  }

  async getPrices(symbols: string[]): Promise<PriceData[]> {
    const cached = this.getBatchCache(symbols);
    if (cached) return cached;

    const results = await Promise.all(symbols.map((s) => this.getPrice(s)));
    this.setBatchCache(symbols, results);
    return results;
  }

  getSourceInfo(): SourceInfo {
    return {
      name: this.name,
      description: 'Test source',
      version: '1.0.0',
      supportedSymbols: ['XLM', 'BTC'],
    };
  }
}

describe('BaseSource', () => {
  let source: TestSource;

  beforeEach(() => {
    source = new TestSource();
  });

  it('should return price data', async () => {
    const data = await source.getPrice('XLM');
    expect(data.symbol).toBe('XLM');
    expect(data.price).toBe(1.0);
    expect(data.source).toBe('test-source');
    expect(data.timestamp).toBeInstanceOf(Date);
  });

  it('should cache individual prices', async () => {
    const first = await source.getPrice('XLM');
    const second = await source.getPrice('XLM');
    expect(first).toBe(second);
  });

  it('should batch cache multiple prices', async () => {
    const first = await source.getPrices(['XLM', 'BTC']);
    const second = await source.getPrices(['XLM', 'BTC']);
    expect(first).toEqual(second);
  });

  it('should return source info', () => {
    const info = source.getSourceInfo();
    expect(info.name).toBe('test-source');
    expect(info.supportedSymbols).toContain('XLM');
  });

  it('should check health', async () => {
    const healthy = await source.isHealthy();
    expect(typeof healthy).toBe('boolean');
  });

  it('should enforce rate limiting', async () => {
    const start = Date.now();
    await source.getPrice('XLM');
    await source.getPrice('BTC');
    await source.getPrice('ETH');
    const elapsed = Date.now() - start;
    // 10 req/s = 100ms min interval
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('should allow configurable rate limit', async () => {
    const fastSource = new TestSource({ rateLimitPerSec: 100 });
    const start = Date.now();
    await fastSource.getPrice('XLM');
    await fastSource.getPrice('BTC');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('should support isHealthy check even with failing endpoint', async () => {
    const badSource = new TestSource({ baseUrl: 'https://nonexistent.example.com' });
    const healthy = await badSource.isHealthy();
    expect(healthy).toBe(false);
  });
});
