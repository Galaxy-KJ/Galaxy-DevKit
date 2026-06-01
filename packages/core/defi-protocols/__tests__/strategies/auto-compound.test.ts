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
    expect(result.reason).toContain('Minimum harvest interval');
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
    expect(result.reason).toContain('Net gain exceeds threshold');
  });

  it('defers when pending yield does not cover gas after the minimum interval', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 0.5,
      gasCost: 2,
      elapsedMs: 120_000,
      minIntervalMs: 60_000,
      minNetGain: 0,
    });
    expect(result.shouldHarvest).toBe(false);
    expect(result.reason).toContain('does not cover gas cost');
    expect(result.nextHarvestInMs).toBeGreaterThan(0);
  });

  it('uses max interval when yield rate is zero but harvest is profitable', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 10,
      gasCost: 1,
      elapsedMs: 120_000,
      minIntervalMs: 60_000,
      maxIntervalMs: 3_600_000,
    });
    expect(result.shouldHarvest).toBe(true);
    expect(result.nextHarvestInMs).toBeLessThanOrEqual(3_600_000);
  });

  it('schedules break-even using max interval when yield rate is zero', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 0,
      gasCost: 1,
      elapsedMs: 120_000,
      minIntervalMs: 60_000,
      maxIntervalMs: 86_400_000,
    });
    expect(result.shouldHarvest).toBe(false);
    expect(result.nextHarvestInMs).toBe(86_400_000);
  });

  it('respects a positive minNetGain threshold', () => {
    const result = optimizeHarvestTiming({
      pendingYield: 2,
      gasCost: 1,
      elapsedMs: 120_000,
      minIntervalMs: 60_000,
      minNetGain: 5,
    });
    expect(result.shouldHarvest).toBe(false);
    expect(result.netGain).toBe(1);
  });
});

describe('estimateCompoundedApy', () => {
  it('returns higher APY than the base rate with frequent compounding', () => {
    const base = 8;
    const compounded = estimateCompoundedApy(base, 52);
    expect(compounded).toBeGreaterThan(base);
  });

  it('returns zero for non-positive inputs', () => {
    expect(estimateCompoundedApy(0, 52)).toBe(0);
    expect(estimateCompoundedApy(5, 0)).toBe(0);
    expect(estimateCompoundedApy(-1, 12)).toBe(0);
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

  it('throws when harvest is called while unprofitable', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 5,
      fetchPendingYield: async () => 0.0001,
      gasCostEstimate: 1,
      minHarvestIntervalMs: 0,
    });

    await expect(strategy.harvest({} as never)).rejects.toThrow(/does not cover gas cost/);
  });

  it('harvests without a reinvest hook', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 8,
      fetchPendingYield: async () => 10,
      gasCostEstimate: 0.5,
      minHarvestIntervalMs: 0,
    });

    const mockKeypair = { publicKey: () => 'GTEST' } as never;
    const result = await strategy.harvest(mockKeypair);

    expect(Number.parseFloat(result.yieldHarvested)).toBe(10);
    expect(Number.parseFloat(result.gasSpent)).toBe(0.5);
    expect(strategy.getAuditLog().filter((e) => e.action === 'reinvest')).toHaveLength(1);
  });

  it('respects minimum harvest interval after a prior harvest', async () => {
    const strategy = new AutoCompoundStrategy({
      baseApyPercent: 10,
      fetchPendingYield: async () => 100,
      gasCostEstimate: 0.01,
      minHarvestIntervalMs: 60_000,
      reinvest: async () => ({ gasSpent: 0 }),
    });

    const mockKeypair = { publicKey: () => 'GTEST' } as never;
    await strategy.harvest(mockKeypair);

    const shouldHarvestAgain = await strategy.shouldHarvest();
    expect(shouldHarvestAgain).toBe(false);
  });
});
