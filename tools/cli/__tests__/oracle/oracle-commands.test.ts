/**
 * @fileoverview Tests for oracle commands
 */

import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { priceCommand } from '../../src/commands/oracle/price';
import { historyCommand } from '../../src/commands/oracle/history';
import { sourcesCommand } from '../../src/commands/oracle/sources';
import { strategiesCommand } from '../../src/commands/oracle/strategies';
import { validateCommand } from '../../src/commands/oracle/validate';

const originalLog = console.log;
const originalCwd = process.cwd();
const originalFetch = (globalThis as unknown as { fetch?: any }).fetch;

beforeEach(() => {
  console.log = jest.fn();
  (globalThis as unknown as { fetch: any }).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ symbol: 'XLM', price: 0.12 }),
  });
});

afterEach(() => {
  console.log = originalLog;
  (globalThis as unknown as { fetch?: any }).fetch = originalFetch;
  process.chdir(originalCwd);
});

describe('oracle command group', () => {
  it('prints price JSON', async () => {
    await priceCommand.parseAsync(['node', 'price', 'XLM', '--json']);
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.symbol).toBe('XLM');
  });

  it('prints history JSON with a short period', async () => {
    await historyCommand.parseAsync([
      'node',
      'history',
      'XLM',
      '--period',
      '1ms',
      '--interval',
      '1ms',
      '--json',
    ]);

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.samples.length).toBeGreaterThanOrEqual(1);
  });

  it('adds and lists custom sources', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-cli-'));
    process.chdir(tmpDir);

    await sourcesCommand.parseAsync([
      'node',
      'sources',
      'add',
      'customapi',
      'https://example.com/prices?symbol={symbol}',
      '--weight',
      '1.2',
    ]);

    await sourcesCommand.parseAsync(['node', 'sources', 'list', '--json']);
    const output = (console.log as jest.Mock).mock.calls.pop()?.[0];
    const parsed = JSON.parse(output);
    expect(parsed.some((entry: any) => entry.name === 'customapi')).toBe(true);
  });

  it('prints strategies JSON', async () => {
    await strategiesCommand.parseAsync(['node', 'strategies', '--json']);
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed[0].name).toBe('median');
  });

  it('prints validation JSON', async () => {
    await validateCommand.parseAsync(['node', 'validate', 'XLM', '--json']);
    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.results.length).toBeGreaterThan(0);
  });
});
