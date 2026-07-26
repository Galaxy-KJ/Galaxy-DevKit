/**
 * @fileoverview twap-verifier tests
 */

import { verifyOnChainTwap } from '../../src/verification/twap-verifier.js';
import type { OnChainOracleSource } from '../../src/sources/real/OnChainOracleSource.js';

const NOW_MS = 1_700_000_000_000;

function mockSource(
  history: { price: number; timestamp: Date; pusher: string }[],
  onChainTwap: number
): OnChainOracleSource {
  return {
    getPriceHistory: jest.fn().mockResolvedValue(history),
    getTwapWindow: jest.fn().mockResolvedValue(onChainTwap),
  } as unknown as OnChainOracleSource;
}

describe('verifyOnChainTwap', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW_MS);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('matches when the on-chain TWAP agrees with the recomputation', async () => {
    const history = [{ price: 2.0, timestamp: new Date(NOW_MS - 100_000), pusher: 'GPUSHER' }];
    const source = mockSource(history, 2.0);

    const result = await verifyOnChainTwap(source, 'XLM/USDC', 300);

    expect(result.matches).toBe(true);
    expect(result.onChainTwap).toBe(2.0);
    expect(result.recomputedTwap).toBe(2.0);
    expect(result.diffBps).toBe(0);
  });

  it('flags a mismatch beyond tolerance as not matching', async () => {
    const history = [{ price: 2.0, timestamp: new Date(NOW_MS - 100_000), pusher: 'GPUSHER' }];
    const source = mockSource(history, 3.0); // deliberately wrong on-chain value

    const result = await verifyOnChainTwap(source, 'XLM/USDC', 300);

    expect(result.matches).toBe(false);
    expect(result.recomputedTwap).toBe(2.0);
    expect(result.diffBps).toBeGreaterThan(10);
  });

  it('accepts a mismatch within a widened tolerance', async () => {
    const history = [{ price: 2.0, timestamp: new Date(NOW_MS - 100_000), pusher: 'GPUSHER' }];
    const source = mockSource(history, 2.001); // 0.05% off

    const result = await verifyOnChainTwap(source, 'XLM/USDC', 300, 50);

    expect(result.matches).toBe(true);
  });

  it('throws when the on-chain price history is empty', async () => {
    const source = mockSource([], 0);

    await expect(verifyOnChainTwap(source, 'XLM/USDC', 300)).rejects.toThrow(
      'price history is empty'
    );
  });
});
