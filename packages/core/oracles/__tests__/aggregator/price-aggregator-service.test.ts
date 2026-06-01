/**
 * @fileoverview Tests for PriceAggregatorService
 */

import { PriceAggregatorService, calculateDeviationPercent } from '../../src/aggregator/price-aggregator.js';
import { AggregatorScheduler } from '../../src/aggregator/scheduler.js';

jest.mock('../../src/aggregator/OracleAggregator.js', () => {
  return {
    OracleAggregator: jest.fn().mockImplementation(() => ({
      setStrategy: jest.fn(),
      addSource: jest.fn(),
      getAggregatedPrice: jest.fn().mockResolvedValue({
        symbol: 'XLM',
        price: 0.12,
        timestamp: new Date(),
        confidence: 0.95,
        sourcesUsed: ['coingecko', 'coinmarketcap'],
        outliersFiltered: [],
        sourceCount: 2,
      }),
    })),
  };
});

jest.mock('../../src/aggregator/sources/index.js', () => ({
  createOracleSources: jest.fn().mockReturnValue([{ name: 'mock-a' }, { name: 'mock-b' }]),
}));

describe('calculateDeviationPercent', () => {
  it('returns infinity when previous price is zero', () => {
    expect(calculateDeviationPercent(0, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('calculates absolute percent change', () => {
    expect(calculateDeviationPercent(100, 100.2)).toBeCloseTo(0.2);
  });
});

describe('AggregatorScheduler', () => {
  it('runs task immediately and on interval', async () => {
    jest.useFakeTimers();
    const task = jest.fn().mockResolvedValue(undefined);
    const scheduler = new AggregatorScheduler(task, { intervalMs: 1000, runImmediately: true });

    await scheduler.start();
    expect(task).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(2);

    scheduler.stop();
    jest.useRealTimers();
  });
});

describe('PriceAggregatorService', () => {
  it('pushes on first price and skips when deviation is below threshold', async () => {
    const pushPrice = jest.fn().mockResolvedValue(undefined);
    const service = new PriceAggregatorService({
      sources: [{ kind: 'coingecko' }, { kind: 'binance' }],
      symbols: ['XLM'],
      updateIntervalMs: 60_000,
      deviationThresholdPercent: 0.1,
      onChainOracleId: 'CORACLE',
      pushPrice,
    });

    await service.runUpdateCycle();
    expect(pushPrice).toHaveBeenCalledTimes(1);

    await service.runUpdateCycle();
    expect(pushPrice).toHaveBeenCalledTimes(1);
  });

  it('pushes again when deviation threshold is exceeded', async () => {
    const { OracleAggregator } = jest.requireMock('../../src/aggregator/OracleAggregator.js');
    const pushPrice = jest.fn().mockResolvedValue(undefined);

    const service = new PriceAggregatorService({
      sources: [{ kind: 'coingecko' }, { kind: 'binance' }],
      symbols: ['XLM'],
      updateIntervalMs: 60_000,
      deviationThresholdPercent: 0.1,
      onChainOracleId: 'CORACLE',
      pushPrice,
    });

    const mockInstance = OracleAggregator.mock.results.at(-1)?.value;
    mockInstance.getAggregatedPrice
      .mockResolvedValueOnce({ symbol: 'XLM', price: 0.12 })
      .mockResolvedValueOnce({ symbol: 'XLM', price: 0.121 });

    await service.runUpdateCycle();
    await service.runUpdateCycle();
    expect(pushPrice).toHaveBeenCalledTimes(2);
  });
});
