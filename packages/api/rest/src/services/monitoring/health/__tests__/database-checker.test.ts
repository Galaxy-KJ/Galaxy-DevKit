import { DatabaseHealthChecker } from '../database-checker';
import { __resetSupabaseClientForTests } from '../../../../utils/supabase';

describe('DatabaseHealthChecker', () => {
  it('is marked as critical', () => {
    const checker = new DatabaseHealthChecker(async () => undefined);
    expect(checker.critical).toBe(true);
    expect(checker.name).toBe('database');
  });

  it('does not throw when constructed without env vars (lazy resolution)', async () => {
    const original = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    __resetSupabaseClientForTests();
    try {
      const checker = new DatabaseHealthChecker();
      const result = await checker.check();
      expect(result.status).toBe('down');
      expect(result.message).toMatch(/SUPABASE_URL/);
    } finally {
      if (original.url !== undefined) process.env.SUPABASE_URL = original.url;
      if (original.key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = original.key;
      __resetSupabaseClientForTests();
    }
  });

  it('returns up when the ping resolves', async () => {
    const checker = new DatabaseHealthChecker(async () => undefined);
    const result = await checker.check();
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns down and surfaces the error message when the ping throws', async () => {
    const checker = new DatabaseHealthChecker(async () => { throw new Error('nope'); });
    const result = await checker.check();
    expect(result.status).toBe('down');
    expect(result.message).toBe('nope');
  });
});
