import { DefiProtocolHealthChecker } from '../defi-checker';

function fetcherFor(responses: Record<string, { ok: boolean; status: number } | Error>) {
  return jest.fn().mockImplementation(async (url: string) => {
    const r = responses[url];
    if (r instanceof Error) throw r;
    if (!r) throw new Error(`no mock for ${url}`);
    return { ok: r.ok, status: r.status, json: async () => ({}) };
  });
}

describe('DefiProtocolHealthChecker', () => {
  const targets = [
    { name: 'blend', url: 'https://blend.test/health' },
    { name: 'soroswap', url: 'https://soroswap.test/health' },
  ];

  it('is non-critical', () => {
    expect(new DefiProtocolHealthChecker().critical).toBe(false);
  });

  it('returns up when all protocols respond ok', async () => {
    const checker = new DefiProtocolHealthChecker({
      targets,
      fetcher: fetcherFor({
        'https://blend.test/health': { ok: true, status: 200 },
        'https://soroswap.test/health': { ok: true, status: 200 },
      }),
    });
    const result = await checker.check();
    expect(result.status).toBe('up');
  });

  it('returns degraded when some but not all protocols fail', async () => {
    const checker = new DefiProtocolHealthChecker({
      targets,
      fetcher: fetcherFor({
        'https://blend.test/health': { ok: true, status: 200 },
        'https://soroswap.test/health': new Error('timeout'),
      }),
    });
    const result = await checker.check();
    expect(result.status).toBe('degraded');
    expect(result.message).toContain('1/2');
  });

  it('returns down when every protocol fails', async () => {
    const checker = new DefiProtocolHealthChecker({
      targets,
      fetcher: fetcherFor({
        'https://blend.test/health': new Error('down'),
        'https://soroswap.test/health': { ok: false, status: 500 },
      }),
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
  });
});
