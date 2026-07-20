import { HorizonHealthChecker } from '../horizon-checker';

function mockFetcher(response: { ok: boolean; status: number; body?: unknown }) {
  return jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body ?? {},
  });
}

describe('HorizonHealthChecker', () => {
  it('returns up on a 2xx response', async () => {
    const checker = new HorizonHealthChecker({
      url: 'https://horizon.test/',
      fetcher: mockFetcher({ ok: true, status: 200 }),
    });
    const result = await checker.check();
    expect(result.status).toBe('up');
    expect(result.details).toEqual(
      expect.objectContaining({ httpStatus: 200, url: 'https://horizon.test/' })
    );
  });

  it('returns down when Horizon responds with a non-2xx', async () => {
    const checker = new HorizonHealthChecker({
      url: 'https://horizon.test/',
      fetcher: mockFetcher({ ok: false, status: 502 }),
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.message).toContain('HTTP 502');
  });

  it('returns down when the fetch rejects', async () => {
    const checker = new HorizonHealthChecker({
      url: 'https://horizon.test/',
      fetcher: jest.fn().mockRejectedValue(new Error('dns error')),
    });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.message).toBe('dns error');
  });
});
