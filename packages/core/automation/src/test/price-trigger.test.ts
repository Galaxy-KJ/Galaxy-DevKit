/**
 * @fileoverview Unit tests for PriceTrigger
 */

import { PriceTrigger } from '../triggers/price-trigger.js';
import { OracleAggregator } from '@galaxy-kj/core-oracles';

describe('PriceTrigger', () => {
  let oracle: jest.Mocked<Pick<OracleAggregator, 'getAggregatedPrices'>>;
  let trigger: PriceTrigger;

  beforeEach(() => {
    oracle = {
      getAggregatedPrices: jest.fn(),
    };
    trigger = new PriceTrigger(oracle as unknown as OracleAggregator);
  });

  it('triggers when pair price is below threshold', async () => {
    oracle.getAggregatedPrices.mockResolvedValue([
      {
        symbol: 'XLM',
        price: 0.08,
        timestamp: new Date(),
        confidence: 1,
        sourcesUsed: ['mock'],
        outliersFiltered: [],
        sourceCount: 1,
      },
      {
        symbol: 'USDC',
        price: 1,
        timestamp: new Date(),
        confidence: 1,
        sourcesUsed: ['mock'],
        outliersFiltered: [],
        sourceCount: 1,
      },
    ]);

    const result = await trigger.evaluate({
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'below',
      threshold: '0.1',
    });

    expect(result).toBe(true);
    expect(oracle.getAggregatedPrices).toHaveBeenCalledWith(['XLM', 'USDC']);
  });

  it('does not trigger when pair price is above threshold', async () => {
    oracle.getAggregatedPrices.mockResolvedValue([
      {
        symbol: 'XLM',
        price: 0.2,
        timestamp: new Date(),
        confidence: 1,
        sourcesUsed: ['mock'],
        outliersFiltered: [],
        sourceCount: 1,
      },
      {
        symbol: 'USDC',
        price: 1,
        timestamp: new Date(),
        confidence: 1,
        sourcesUsed: ['mock'],
        outliersFiltered: [],
        sourceCount: 1,
      },
    ]);

    const result = await trigger.evaluate({
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'below',
      threshold: '0.1',
    });

    expect(result).toBe(false);
  });

  it('returns false when oracle prices are unavailable', async () => {
    oracle.getAggregatedPrices.mockResolvedValue([]);

    const result = await trigger.evaluate({
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'above',
      threshold: '0.1',
    });

    expect(result).toBe(false);
  });

  it('throws for non-numeric thresholds', async () => {
    await expect(
      trigger.evaluate({
        assetIn: 'XLM',
        assetOut: 'USDC',
        condition: 'above',
        threshold: 'not-a-number',
      })
    ).rejects.toThrow('threshold must be a numeric string');
  });
});
