import { withQueryLogging } from '../query-metrics';

describe('withQueryLogging', () => {
  const originalThreshold = process.env.SLOW_QUERY_THRESHOLD_MS;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (originalThreshold === undefined) {
      delete process.env.SLOW_QUERY_THRESHOLD_MS;
    } else {
      process.env.SLOW_QUERY_THRESHOLD_MS = originalThreshold;
    }
  });

  it('resolves with the wrapped value', async () => {
    const result = await withQueryLogging('test.query', () => Promise.resolve({ data: [1, 2], error: null }));
    expect(result).toEqual({ data: [1, 2], error: null });
  });

  it('does not warn when execution is under the threshold', async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = '100';
    await withQueryLogging('fast.query', () => Promise.resolve({ data: [], error: null }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when execution exceeds the configured threshold', async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = '100';
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000) // start
      .mockReturnValueOnce(1_250); // end — 250ms elapsed

    await withQueryLogging('slow.query', () => Promise.resolve({ data: [], error: null }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('[slow-query] slow.query took 250ms');
    nowSpy.mockRestore();
  });

  it('still logs and rethrows when the wrapped call fails', async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = '100';
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_250);

    await expect(
      withQueryLogging('failing.query', () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
  });

  it('falls back to the default threshold on an invalid env value', async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = 'not-a-number';
    await withQueryLogging('fast.query', () => Promise.resolve({ data: [], error: null }));
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
