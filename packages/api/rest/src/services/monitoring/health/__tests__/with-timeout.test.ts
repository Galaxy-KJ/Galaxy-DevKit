import { HealthCheckTimeoutError, withTimeout } from '../with-timeout';

describe('withTimeout', () => {
  it('resolves when the op finishes before the timeout', async () => {
    const result = await withTimeout('t', 100, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('rejects with HealthCheckTimeoutError when the op exceeds the timeout', async () => {
    const slow = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 100));
    await expect(withTimeout('slow', 20, slow)).rejects.toBeInstanceOf(HealthCheckTimeoutError);
  });

  it('propagates the underlying rejection unchanged', async () => {
    const err = new Error('boom');
    await expect(withTimeout('t', 100, async () => { throw err; })).rejects.toBe(err);
  });
});
