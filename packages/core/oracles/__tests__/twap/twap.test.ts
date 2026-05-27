/**
 * @fileoverview Tests for TWAPCalculator and PriceHistoryStore
 */

import { PriceHistoryStore } from '../../src/twap/price-history-store.js';
import { TWAPCalculator } from '../../src/twap/twap-calculator.js';

describe('TWAPCalculator', () => {
  let historyStore: PriceHistoryStore;
  let calculator: TWAPCalculator;

  beforeEach(() => {
    historyStore = new PriceHistoryStore(5 * 60 * 1000); // 5 minute retention
    calculator = new TWAPCalculator(historyStore);
  });

  it('calculates correct TWAP for a simple series', async () => {
    const baseTime = Date.now() - 180_000;
    await calculator.recordPrice('XLM', 100, baseTime);
    await calculator.recordPrice('XLM', 110, baseTime + 60_000);
    await calculator.recordPrice('XLM', 130, baseTime + 120_000);

    const result = await calculator.getTWAP('XLM', {
      windowMs: 180_000,
      minDataPoints: 2,
    });

    expect(result).toBeCloseTo(113.3333, 4);
  });

  it('returns simple average when all timestamps are identical', async () => {
    const timestamp = Date.now();
    await calculator.recordPrice('XLM', 100, timestamp);
    await calculator.recordPrice('XLM', 200, timestamp);

    const result = await calculator.getTWAP('XLM', {
      windowMs: 60_000,
      minDataPoints: 2,
    });

    expect(result).toBe(150);
  });

  it('enforces minDataPoints requirement', async () => {
    await calculator.recordPrice('XLM', 100, 1_700_000_000_000);

    await expect(
      calculator.getTWAP('XLM', { windowMs: 60_000, minDataPoints: 2 })
    ).rejects.toThrow('Insufficient TWAP history');
  });

  it('prunes old observations automatically based on window', async () => {
    const baseTime = Date.now();
    await historyStore.recordPrice('XLM', 100, baseTime - 600_000); // 10 minutes old
    await historyStore.recordPrice('XLM', 200, baseTime - 30_000); // 30 seconds old

    const recent = historyStore.getHistoryWithinWindow('XLM', 60_000);
    expect(recent).toHaveLength(1);
    expect(recent[0].price).toBe(200);
  });

  it('throws for invalid symbol or config values', async () => {
    await expect(
      calculator.getTWAP('', { windowMs: 60_000, minDataPoints: 1 })
    ).rejects.toThrow('Symbol must be a non-empty string');

    await calculator.recordPrice('XLM', 100, 1_700_000_000_000);
    await expect(
      calculator.getTWAP('XLM', { windowMs: 0, minDataPoints: 1 })
    ).rejects.toThrow('TWAPConfig.windowMs must be a positive number');
  });
});
