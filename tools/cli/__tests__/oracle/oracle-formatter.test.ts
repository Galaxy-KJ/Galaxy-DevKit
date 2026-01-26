/**
 * @fileoverview Tests for oracle output formatter
 */

import {
  outputPrice,
  outputHistory,
  outputSources,
  outputStrategies,
  outputValidation,
} from '../../src/utils/oracle-formatter';

describe('oracle formatter', () => {
  const originalLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('outputs price JSON', () => {
    outputPrice(
      {
        symbol: 'XLM',
        price: 0.12,
        timestamp: new Date('2026-01-26T00:00:00.000Z'),
        confidence: 0.9,
        sourcesUsed: ['coingecko'],
        outliersFiltered: [],
        sourceCount: 1,
      },
      { json: true, strategy: 'median', sourcesFilter: ['coingecko'] }
    );

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.symbol).toBe('XLM');
    expect(parsed.strategy).toBe('median');
    expect(parsed.sourcesFilter).toEqual(['coingecko']);
  });

  it('outputs history JSON', () => {
    outputHistory(
      [
        { price: 0.1, timestamp: new Date('2026-01-26T00:00:00.000Z') },
        { price: 0.12, timestamp: new Date('2026-01-26T00:00:05.000Z') },
      ],
      { json: true, periodMs: 10000, intervalMs: 5000, twap: 0.11 }
    );

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.samples).toHaveLength(2);
    expect(parsed.twap).toBe(0.11);
  });

  it('outputs sources JSON', () => {
    outputSources(
      [
        {
          source: {
            name: 'coingecko',
            weight: 1,
            isHealthy: true,
            lastChecked: new Date('2026-01-26T00:00:00.000Z'),
            failureCount: 0,
          },
          info: {
            name: 'coingecko',
            description: 'Mock source',
            version: '1.0.0',
            supportedSymbols: ['XLM'],
          },
          type: 'default',
        },
      ],
      { json: true }
    );

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed[0].name).toBe('coingecko');
  });

  it('outputs strategies JSON', () => {
    outputStrategies(
      [
        { name: 'median', description: 'Median' },
        { name: 'twap', description: 'TWAP' },
      ],
      true
    );

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
  });

  it('outputs validation JSON', () => {
    outputValidation(
      [
        {
          source: 'coingecko',
          price: 0.12,
          timestamp: '2026-01-26T00:00:00.000Z',
          valid: true,
          issues: [],
        },
      ],
      { json: true, deviationPercent: 0, threshold: 5, maxAgeMs: 60000 }
    );

    const output = (console.log as jest.Mock).mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.results).toHaveLength(1);
  });
});
