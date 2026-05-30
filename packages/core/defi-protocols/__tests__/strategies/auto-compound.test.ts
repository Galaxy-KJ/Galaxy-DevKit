import {
  AutoCompoundStrategy,
  estimateCompoundedApy,
  optimizeHarvestTiming,
} from '../../src/strategies/auto-compound.js';

describe('optimizeHarvestTiming', () => {
  it('defers harvest until minimum interval elapses', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 10,
      gasCost: 1,
      elapsedMs: 1000,
      minIntervalMs: 60_000,
    });
    expect(result.shouldHarvest).toBe(false);
  });

  it('harvests when net gain is positive after interval', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 5,
      gasCost: 1,
      elapsedMs: 120_000,
      minIntervalMs: 60_000,
    });
    expect(result.shouldHarvest).toBe(true);
    expect(result.netGain).toBe(4);
  });
});

describe('estimateCompoundedApy', () => {
  it('returns higher APY than the base rate with frequent compounding', () => {
    const base = 8;
    const compounded = estimateCompoundedApy(base, 52);
    expect(compounded).toBeGreaterThan(base);
  });
});

describe('AutoCompoundStrategy', () => {
  it('skips harvest when yield does not cover gas', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 5,
      fetchPendingYield: async () => 0.0001,
      gasCostEstimate: 1,
      minHarvestIntervalMs: 0,
    });

    const should = await strategy.shouldHarvest();
    expect(should).toBe(false);
    expect(strategy.getAuditLog().some((e) => e.action === 'skip')).toBe(true);
  });

  it('harvests and logs compound events when profitable', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 10,
      fetchPendingYield: async () => 5,
      gasCostEstimate: 1,
      minHarvestIntervalMs: 0,
      reinvest: async () => ({ gasSpent: 0.5, txHash: 'mock-tx' }),
    });

    expect(await strategy.shouldHarvest()).toBe(true);

    const mockKeypair = { publicKey: () => 'GTEST' } as never;
    const result = await strategy.harvest(mockKeypair);

    expect(Number.parseFloat(result.netGain)).toBeGreaterThan(0);
    expect(strategy.getAuditLog().filter((e) => e.action === 'harvest')).toHaveLength(1);
    expect(strategy.getAuditLog().filter((e) => e.action === 'reinvest')).toHaveLength(1);
  });

  it('estimates compounded APY above base APY', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 6,
      harvestsPerYear: 26,
    });
    const apy = await strategy.getEstimatedAPY();
    expect(apy).toBeGreaterThan(6);
  });
});
