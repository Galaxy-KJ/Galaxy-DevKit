/**
 * Unit tests for `galaxy watch price <asset>`.
 *
 * Tests use the JSON output mode + capped tick count + injected sleep so they
 * run synchronously without spinning up the blessed TTY UI.
 */

import { runPriceWatch, type PriceTick } from '../../src/commands/watch/price';

interface MockAggregator {
  setStrategy: jest.Mock;
  getAggregatedPrice: jest.Mock;
  getSources: jest.Mock;
}

function captureStdout(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any) => {
    String(chunk)
      .split('\n')
      .filter(Boolean)
      .forEach((line) => lines.push(line));
    return true;
  };
  return { lines, restore: () => ((process.stdout as any).write = orig) };
}

const buildAggregator = (prices: number[]): MockAggregator => {
  let i = 0;
  return {
    setStrategy: jest.fn(),
    getSources: jest.fn().mockReturnValue([{ name: 'mock' }]),
    getAggregatedPrice: jest.fn().mockImplementation(() =>
      Promise.resolve({
        price: prices[Math.min(i++, prices.length - 1)] ?? 0,
        confidence: 0.99,
        sourcesUsed: [{ name: 'mock' }],
      }),
    ),
  };
};

describe('runPriceWatch', () => {
  it('rejects non-numeric --interval', async () => {
    const factory = jest.fn().mockResolvedValue(buildAggregator([1]));
    await expect(
      runPriceWatch(
        'XLM',
        { network: 'testnet', interval: 'foo', json: true },
        { aggregatorFactory: factory as any, maxTicks: 1, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow(/--interval must be a positive integer/);
  });

  it('rejects non-numeric --alert-above', async () => {
    const factory = jest.fn().mockResolvedValue(buildAggregator([1]));
    await expect(
      runPriceWatch(
        'XLM',
        { network: 'testnet', interval: '1', json: true, alertAbove: 'NaN' },
        { aggregatorFactory: factory as any, maxTicks: 1, sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow(/--alert-above must be a finite number/);
  });

  it('emits one JSON tick per poll plus a started event', async () => {
    const aggregator = buildAggregator([0.12, 0.13, 0.11]);
    const factory = jest.fn().mockResolvedValue(aggregator);
    const cap = captureStdout();
    try {
      await runPriceWatch(
        'XLM',
        { network: 'testnet', interval: '1', json: true },
        {
          aggregatorFactory: factory as any,
          maxTicks: 3,
          sleep: () => Promise.resolve(),
        },
      );
    } finally {
      cap.restore();
    }

    expect(aggregator.getAggregatedPrice).toHaveBeenCalledTimes(3);
    expect(cap.lines).toHaveLength(4); // started + 3 ticks
    const ticks: PriceTick[] = cap.lines.map((l) => JSON.parse(l));
    expect(ticks[0]).toMatchObject({ symbol: 'XLM' });
    expect(ticks[1]).toMatchObject({ symbol: 'XLM', price: 0.12, sourcesUsed: 1 });
    expect(ticks[2].changePercent).toBeCloseTo(((0.13 - 0.12) / 0.12) * 100, 4);
    expect(ticks[3].changePercent).toBeCloseTo(((0.11 - 0.13) / 0.13) * 100, 4);
  });

  it('flags alerts when price crosses thresholds', async () => {
    const aggregator = buildAggregator([0.1, 0.5, 0.05]);
    const factory = jest.fn().mockResolvedValue(aggregator);
    const cap = captureStdout();
    try {
      await runPriceWatch(
        'XLM',
        {
          network: 'testnet',
          interval: '1',
          json: true,
          alertAbove: '0.4',
          alertBelow: '0.06',
        },
        {
          aggregatorFactory: factory as any,
          maxTicks: 3,
          sleep: () => Promise.resolve(),
        },
      );
    } finally {
      cap.restore();
    }

    const ticks: PriceTick[] = cap.lines
      .map((l) => JSON.parse(l))
      .filter((t) => t.price !== undefined);
    expect(ticks).toHaveLength(3);
    expect(ticks[0].alert).toBeUndefined();
    expect(ticks[1].alert).toBe('above');
    expect(ticks[2].alert).toBe('below');
  });

  it('reports aggregator errors as error ticks without crashing the loop', async () => {
    const aggregator: MockAggregator = {
      setStrategy: jest.fn(),
      getSources: jest.fn().mockReturnValue([]),
      getAggregatedPrice: jest
        .fn()
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValue({ price: 1, confidence: 1, sourcesUsed: [{ name: 'x' }] }),
    };
    const factory = jest.fn().mockResolvedValue(aggregator);

    const cap = captureStdout();
    try {
      await runPriceWatch(
        'XLM',
        { network: 'testnet', interval: '1', json: true },
        {
          aggregatorFactory: factory as any,
          maxTicks: 2,
          sleep: () => Promise.resolve(),
        },
      );
    } finally {
      cap.restore();
    }

    const ticks: PriceTick[] = cap.lines.map((l) => JSON.parse(l));
    const errTick = ticks.find((t) => t.error);
    expect(errTick).toBeDefined();
    expect(errTick!.error).toMatch(/rate limited/);
    // The next poll succeeded — loop survived the failure.
    const okTick = ticks.find((t) => t.price === 1);
    expect(okTick).toBeDefined();
  });

  it('emits ticks via the dashboard logBox in non-JSON mode', async () => {
    const aggregator = buildAggregator([1.0, 1.5]);
    const factory = jest.fn().mockResolvedValue(aggregator);
    const log = jest.fn();
    const render = jest.fn();

    await runPriceWatch(
      'XLM',
      { network: 'testnet', interval: '1', json: false, alertAbove: '1.4' },
      {
        aggregatorFactory: factory as any,
        maxTicks: 2,
        sleep: () => Promise.resolve(),
        ui: { logBox: { log }, render },
      },
    );

    const allLogs = log.mock.calls.map((c) => c[0]).join('\n');
    expect(allLogs).toMatch(/XLM/);
    expect(allLogs).toMatch(/ALERT: price crossed above threshold/);
    expect(render).toHaveBeenCalled();
  });
});
