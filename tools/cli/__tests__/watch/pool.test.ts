/**
 * Unit tests for `galaxy watch pool <id>`.
 */

import {
  diffReserves,
  runPoolWatch,
  type PoolReserve,
  type PoolTick,
} from '../../src/commands/watch/pool';

const VALID_POOL_ID =
  'b3f2c1a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0';

function buildStreamManager(snapshots: Array<{ reserves: PoolReserve[]; total_shares: string; fee_bp: number } | Error>) {
  let i = 0;
  return {
    getServer: () => ({
      liquidityPools: () => ({
        liquidityPool: (_id: string) => ({
          call: () => {
            const next = snapshots[Math.min(i++, snapshots.length - 1)];
            if (next instanceof Error) return Promise.reject(next);
            return Promise.resolve(next);
          },
        }),
      }),
    }),
  } as any;
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any) => {
    String(chunk)
      .split('\n')
      .filter(Boolean)
      .forEach((l) => lines.push(l));
    return true;
  };
  return { lines, restore: () => ((process.stdout as any).write = orig) };
}

describe('runPoolWatch', () => {
  it('rejects malformed pool ids', async () => {
    await expect(
      runPoolWatch(
        'not-a-pool-id',
        { network: 'testnet', interval: '1', json: true },
        { streamManager: buildStreamManager([]), maxTicks: 1, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow(/Invalid pool id/);
  });

  it('rejects bad --interval', async () => {
    await expect(
      runPoolWatch(
        VALID_POOL_ID,
        { network: 'testnet', interval: '-1', json: true },
        { streamManager: buildStreamManager([]), maxTicks: 1, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow(/--interval must be a positive integer/);
  });

  it('emits one JSON tick per poll and reports reserve deltas', async () => {
    const stream = buildStreamManager([
      { reserves: [{ asset: 'native', amount: '100.0000000' }, { asset: 'USDC:GA…', amount: '50.0000000' }], total_shares: '1000', fee_bp: 30 },
      { reserves: [{ asset: 'native', amount: '110.0000000' }, { asset: 'USDC:GA…', amount: '50.0000000' }], total_shares: '1000', fee_bp: 30 },
    ]);

    const cap = captureStdout();
    try {
      await runPoolWatch(
        VALID_POOL_ID,
        { network: 'testnet', interval: '1', json: true },
        { streamManager: stream, maxTicks: 2, sleep: () => Promise.resolve() },
      );
    } finally {
      cap.restore();
    }

    const ticks: PoolTick[] = cap.lines.map((l) => JSON.parse(l));
    // started + 2 ticks
    expect(ticks).toHaveLength(3);
    expect(ticks[1].reserves?.[0].amount).toBe('100.0000000');
    expect(ticks[2].changes).toEqual([
      { asset: 'native', from: '100.0000000', to: '110.0000000' },
    ]);
  });

  it('reports Horizon errors as error ticks without crashing', async () => {
    const stream = buildStreamManager([
      new Error('not found'),
      { reserves: [{ asset: 'native', amount: '1' }], total_shares: '1', fee_bp: 30 },
    ]);

    const cap = captureStdout();
    try {
      await runPoolWatch(
        VALID_POOL_ID,
        { network: 'testnet', interval: '1', json: true },
        { streamManager: stream, maxTicks: 2, sleep: () => Promise.resolve() },
      );
    } finally {
      cap.restore();
    }

    const ticks: PoolTick[] = cap.lines.map((l) => JSON.parse(l));
    const err = ticks.find((t) => t.error);
    expect(err?.error).toMatch(/not found/);
    const ok = ticks.find((t) => Array.isArray(t.reserves));
    expect(ok).toBeDefined();
  });

  it('emits to logBox in dashboard mode and surfaces deltas', async () => {
    const stream = buildStreamManager([
      { reserves: [{ asset: 'native', amount: '100' }], total_shares: '1', fee_bp: 30 },
      { reserves: [{ asset: 'native', amount: '101' }], total_shares: '1', fee_bp: 30 },
    ]);
    const log = jest.fn();
    const render = jest.fn();

    await runPoolWatch(
      VALID_POOL_ID,
      { network: 'testnet', interval: '1', json: false },
      {
        streamManager: stream,
        maxTicks: 2,
        sleep: () => Promise.resolve(),
        ui: { logBox: { log }, render },
      },
    );

    const allLogs = log.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogs).toMatch(/native/);
    expect(allLogs).toMatch(/100 → 101/);
    expect(render).toHaveBeenCalled();
  });

  describe('diffReserves helper', () => {
    it('flags only assets whose amount changed', () => {
      expect(
        diffReserves(
          [
            { asset: 'A', amount: '1' },
            { asset: 'B', amount: '2' },
          ],
          [
            { asset: 'A', amount: '1' },
            { asset: 'B', amount: '3' },
          ],
        ),
      ).toEqual([{ asset: 'B', from: '2', to: '3' }]);
    });

    it('returns an empty list when nothing changed', () => {
      const same = [{ asset: 'A', amount: '1' }];
      expect(diffReserves(same, same)).toEqual([]);
    });
  });
});
