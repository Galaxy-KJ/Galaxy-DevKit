/**
 * @fileoverview Tests for oracle registry utilities
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  createOracleSources,
  loadOracleConfig,
  saveOracleConfig,
} from '../../src/utils/oracle-registry';

describe('oracle registry', () => {
  const originalFetch = (globalThis as unknown as { fetch?: any }).fetch;

  beforeEach(() => {
    (globalThis as unknown as { fetch: any }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ symbol: 'XLM', price: 1.23 }),
    });
  });

  afterEach(() => {
    (globalThis as unknown as { fetch?: any }).fetch = originalFetch;
  });

  it('returns default config when no file exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-config-'));
    const config = await loadOracleConfig(tmpDir);
    expect(config.sources).toEqual([]);
  });

  it('saves and loads custom sources', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-config-'));
    await saveOracleConfig(
      {
        sources: [
          {
            name: 'CustomAPI',
            url: 'https://example.com/prices?symbol={symbol}',
            weight: 1.5,
          },
        ],
      },
      tmpDir
    );

    const config = await loadOracleConfig(tmpDir);
    expect(config.sources).toHaveLength(1);
    expect(config.sources[0].name).toBe('customapi');
  });

  it('creates custom sources and fetches price data', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-config-'));
    await saveOracleConfig(
      {
        sources: [
          {
            name: 'customapi',
            url: 'https://example.com/prices?symbol={symbol}',
            weight: 2.0,
          },
        ],
      },
      tmpDir
    );

    const entries = await createOracleSources({ includeSources: ['customapi'], cwd: tmpDir });
    expect(entries).toHaveLength(1);

    const price = await entries[0].source.getPrice('XLM');
    expect(price.price).toBe(1.23);
    expect(price.symbol).toBe('XLM');
  });
});
