/**
 * @fileoverview Unit tests for YieldFarmingAggregator
 * @description Covers opportunity fetching, APY sorting, deposit routing,
 *              rebalancing calculations, and weighted-average APY.
 */

import {
  YieldFarmingAggregator,
  YieldOpportunity,
  YieldSource,
  DepositResult,
  BlendYieldSource,
  SoroswapYieldSource,
  VaultYieldSource,
  BlendPoolFetcher,
  SoroswapPoolFetcher,
  VaultStrategyFetcher,
} from '../../src/services/yield-farming-aggregator.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function opportunity(
  protocol: string,
  asset: string,
  apy: number,
  tvl = '1000000',
  sourceId = `${protocol}-${asset}`,
): YieldOpportunity {
  return { protocol, asset, apy, tvl, sourceId };
}

function depositResult(opp: YieldOpportunity, amount: string): DepositResult {
  return {
    txId: `tx-${opp.protocol}-${opp.asset}`,
    amountDeposited: amount,
    sharesReceived: amount,
    opportunity: opp,
  };
}

/** Build a mock YieldSource that returns fixed opportunities. */
function mockSource(
  protocol: string,
  opportunities: YieldOpportunity[],
  depositFn?: (opp: YieldOpportunity, amount: string) => Promise<DepositResult>,
  withdrawFn?: (opp: YieldOpportunity, amount: string) => Promise<string>,
): jest.Mocked<YieldSource> {
  return {
    protocol,
    fetchOpportunities: jest.fn().mockResolvedValue(opportunities),
    deposit: jest.fn(depositFn ?? (async (opp, amount) => depositResult(opp, amount))),
    withdraw: jest.fn(withdrawFn ?? (async (_opp, amount) => amount)),
  } as jest.Mocked<YieldSource>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('YieldFarmingAggregator', () => {

  // ── getOpportunities ───────────────────────────────────────────────────────

  describe('getOpportunities', () => {
    it('returns opportunities from all sources sorted by APY descending', async () => {
      const blend    = mockSource('Blend',    [opportunity('Blend',    'USDC', 8.5)]);
      const soroswap = mockSource('Soroswap', [opportunity('Soroswap', 'USDC', 12.3)]);
      const vault    = mockSource('Vault',    [opportunity('Vault',    'USDC', 5.1)]);

      const aggregator = new YieldFarmingAggregator([blend, soroswap, vault]);
      const results = await aggregator.getOpportunities();

      expect(results).toHaveLength(3);
      expect(results[0].apy).toBe(12.3);
      expect(results[0].protocol).toBe('Soroswap');
      expect(results[1].apy).toBe(8.5);
      expect(results[2].apy).toBe(5.1);
    });

    it('returns an empty array when no sources are registered', async () => {
      const aggregator = new YieldFarmingAggregator([]);
      expect(await aggregator.getOpportunities()).toEqual([]);
    });

    it('merges opportunities from multiple sources', async () => {
      const blend = mockSource('Blend', [
        opportunity('Blend', 'USDC', 9.0),
        opportunity('Blend', 'XLM',  6.0),
      ]);
      const vault = mockSource('Vault', [
        opportunity('Vault', 'USDC', 11.0),
      ]);

      const aggregator = new YieldFarmingAggregator([blend, vault]);
      const results = await aggregator.getOpportunities();

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.protocol)).toEqual(['Vault', 'Blend', 'Blend']);
    });

    it('skips a failing source and returns the rest', async () => {
      const bad  = { protocol: 'Bad',  fetchOpportunities: jest.fn().mockRejectedValue(new Error('network error')), deposit: jest.fn(), withdraw: jest.fn() };
      const good = mockSource('Good', [opportunity('Good', 'USDC', 7.0)]);

      const aggregator = new YieldFarmingAggregator([bad, good]);
      const results = await aggregator.getOpportunities();

      expect(results).toHaveLength(1);
      expect(results[0].protocol).toBe('Good');
    });

    it('calls fetchOpportunities on every source', async () => {
      const s1 = mockSource('S1', []);
      const s2 = mockSource('S2', []);
      const aggregator = new YieldFarmingAggregator([s1, s2]);
      await aggregator.getOpportunities();
      expect(s1.fetchOpportunities).toHaveBeenCalledTimes(1);
      expect(s2.fetchOpportunities).toHaveBeenCalledTimes(1);
    });
  });

  // ── getBestOpportunity ─────────────────────────────────────────────────────

  describe('getBestOpportunity', () => {
    it('returns the highest-APY opportunity for the requested asset', async () => {
      const source = mockSource('Blend', [
        opportunity('Blend', 'USDC', 8.0),
        opportunity('Blend', 'USDC', 12.0),
        opportunity('Blend', 'XLM',  15.0),
      ]);

      const aggregator = new YieldFarmingAggregator([source]);
      const best = await aggregator.getBestOpportunity('USDC');

      expect(best).toBeDefined();
      expect(best!.apy).toBe(12.0);
      expect(best!.asset).toBe('USDC');
    });

    it('is case-insensitive for the asset code', async () => {
      const source = mockSource('Blend', [opportunity('Blend', 'USDC', 9.0)]);
      const aggregator = new YieldFarmingAggregator([source]);
      expect(await aggregator.getBestOpportunity('usdc')).toBeDefined();
    });

    it('returns undefined when no opportunities exist for the asset', async () => {
      const source = mockSource('Blend', [opportunity('Blend', 'XLM', 5.0)]);
      const aggregator = new YieldFarmingAggregator([source]);
      expect(await aggregator.getBestOpportunity('USDC')).toBeUndefined();
    });
  });

  // ── deposit ────────────────────────────────────────────────────────────────

  describe('deposit', () => {
    it('routes to the correct source adapter', async () => {
      const blendOpp = opportunity('Blend', 'USDC', 8.0);
      const blend    = mockSource('Blend', [blendOpp]);

      const aggregator = new YieldFarmingAggregator([blend]);
      const result = await aggregator.deposit(blendOpp, '500');

      expect(blend.deposit).toHaveBeenCalledWith(blendOpp, '500');
      expect(result.amountDeposited).toBe('500');
      expect(result.opportunity).toBe(blendOpp);
    });

    it('throws for an invalid (zero) amount', async () => {
      const opp = opportunity('Blend', 'USDC', 8.0);
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [opp])]);
      await expect(aggregator.deposit(opp, '0')).rejects.toThrow('amount must be a positive numeric string');
    });

    it('throws for a negative amount', async () => {
      const opp = opportunity('Blend', 'USDC', 8.0);
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [opp])]);
      await expect(aggregator.deposit(opp, '-100')).rejects.toThrow('amount must be a positive numeric string');
    });

    it('throws for a non-numeric amount', async () => {
      const opp = opportunity('Blend', 'USDC', 8.0);
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [opp])]);
      await expect(aggregator.deposit(opp, 'abc')).rejects.toThrow('amount must be a positive numeric string');
    });

    it('throws when no source is registered for the protocol', async () => {
      const opp = opportunity('Unknown', 'USDC', 8.0);
      const aggregator = new YieldFarmingAggregator([]);
      await expect(aggregator.deposit(opp, '100')).rejects.toThrow(
        'No yield source registered for protocol "Unknown"',
      );
    });
  });

  // ── depositOptimal ─────────────────────────────────────────────────────────

  describe('depositOptimal', () => {
    it('deposits into the highest-APY source for the asset', async () => {
      const low  = opportunity('Blend',    'USDC', 5.0);
      const high = opportunity('Soroswap', 'USDC', 15.0);

      const blend    = mockSource('Blend',    [low]);
      const soroswap = mockSource('Soroswap', [high]);

      const aggregator = new YieldFarmingAggregator([blend, soroswap]);
      const result = await aggregator.depositOptimal('USDC', '1000');

      expect(soroswap.deposit).toHaveBeenCalledWith(high, '1000');
      expect(blend.deposit).not.toHaveBeenCalled();
      expect(result.opportunity.protocol).toBe('Soroswap');
    });

    it('throws when no opportunities exist for the asset', async () => {
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [])]);
      await expect(aggregator.depositOptimal('USDC', '100')).rejects.toThrow(
        'No yield opportunities available for asset "USDC"',
      );
    });
  });

  // ── rebalance ──────────────────────────────────────────────────────────────

  describe('rebalance', () => {
    it('returns null when improvement is below the threshold', async () => {
      const current = opportunity('Blend', 'USDC', 10.0);
      const best    = opportunity('Vault', 'USDC', 10.3); // only +0.3, threshold=0.5

      const aggregator = new YieldFarmingAggregator(
        [mockSource('Blend', [current]), mockSource('Vault', [best])],
        { rebalanceThresholdPct: 0.5 },
      );

      const result = await aggregator.rebalance(
        [{ opportunity: current, amount: '1000' }],
        '1000',
        'USDC',
      );
      expect(result).toBeNull();
    });

    it('executes rebalance when improvement exceeds threshold', async () => {
      const current = opportunity('Blend', 'USDC', 8.0);
      const better  = opportunity('Vault', 'USDC', 14.0); // +6, above 0.5 threshold

      const blend = mockSource('Blend', [current]);
      const vault = mockSource('Vault', [better]);

      const aggregator = new YieldFarmingAggregator([blend, vault], { rebalanceThresholdPct: 0.5 });

      const result = await aggregator.rebalance(
        [{ opportunity: current, amount: '1000' }],
        '1000',
        'USDC',
      );

      expect(result).not.toBeNull();
      expect(result!.exited).toHaveLength(1);
      expect(result!.exited[0].opportunity.protocol).toBe('Blend');
      expect(result!.entered.opportunity.protocol).toBe('Vault');
      expect(result!.apyGainPct).toBeCloseTo(6.0, 5);
    });

    it('exits all current positions before entering the new one', async () => {
      const pos1 = opportunity('Blend',    'USDC', 5.0, '500000', 'blend-usdc-1');
      const pos2 = opportunity('Soroswap', 'USDC', 7.0, '300000', 'soroswap-usdc-1');
      const best = opportunity('Vault',    'USDC', 14.0);

      const blend    = mockSource('Blend',    [pos1]);
      const soroswap = mockSource('Soroswap', [pos2]);
      const vault    = mockSource('Vault',    [best]);

      const aggregator = new YieldFarmingAggregator([blend, soroswap, vault]);

      const result = await aggregator.rebalance(
        [
          { opportunity: pos1, amount: '500' },
          { opportunity: pos2, amount: '500' },
        ],
        '1000',
        'USDC',
      );

      expect(result).not.toBeNull();
      expect(result!.exited).toHaveLength(2);
      expect(blend.withdraw).toHaveBeenCalledWith(pos1, '500');
      expect(soroswap.withdraw).toHaveBeenCalledWith(pos2, '500');
      expect(vault.deposit).toHaveBeenCalledWith(best, '1000');
    });

    it('returns null for empty current positions', async () => {
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [])]);
      expect(await aggregator.rebalance([], '0', 'USDC')).toBeNull();
    });

    it('returns null when no best opportunity is found for the asset', async () => {
      const current = opportunity('Blend', 'XLM', 5.0);
      const aggregator = new YieldFarmingAggregator([mockSource('Blend', [current])]);

      // Ask for USDC rebalance — no USDC opportunities exist
      const result = await aggregator.rebalance(
        [{ opportunity: current, amount: '1000' }],
        '1000',
        'USDC',
      );
      expect(result).toBeNull();
    });
  });

  // ── weightedAverageApy ─────────────────────────────────────────────────────

  describe('weightedAverageApy', () => {
    it('computes correct weighted average for two positions', () => {
      const aggregator = new YieldFarmingAggregator([]);
      const positions = [
        { opportunity: opportunity('Blend',    'USDC', 10.0), amount: '600' },
        { opportunity: opportunity('Soroswap', 'USDC', 20.0), amount: '400' },
      ];
      // (600/1000)*10 + (400/1000)*20 = 6 + 8 = 14
      expect(aggregator.weightedAverageApy(positions)).toBeCloseTo(14.0, 5);
    });

    it('returns 0 for empty positions', () => {
      const aggregator = new YieldFarmingAggregator([]);
      expect(aggregator.weightedAverageApy([])).toBe(0);
    });

    it('returns 0 when all amounts are zero', () => {
      const aggregator = new YieldFarmingAggregator([]);
      const positions = [
        { opportunity: opportunity('Blend', 'USDC', 10.0), amount: '0' },
      ];
      expect(aggregator.weightedAverageApy(positions)).toBe(0);
    });

    it('returns the single position APY for a single position', () => {
      const aggregator = new YieldFarmingAggregator([]);
      const positions = [
        { opportunity: opportunity('Blend', 'USDC', 12.5), amount: '1000' },
      ];
      expect(aggregator.weightedAverageApy(positions)).toBeCloseTo(12.5, 5);
    });

    it('handles unequal weights correctly', () => {
      const aggregator = new YieldFarmingAggregator([]);
      // 100 @ 5% and 900 @ 15% → (0.1*5) + (0.9*15) = 0.5 + 13.5 = 14
      const positions = [
        { opportunity: opportunity('A', 'USDC', 5.0),  amount: '100' },
        { opportunity: opportunity('B', 'USDC', 15.0), amount: '900' },
      ];
      expect(aggregator.weightedAverageApy(positions)).toBeCloseTo(14.0, 5);
    });
  });

  // ── Concrete adapter unit tests ────────────────────────────────────────────

  describe('BlendYieldSource', () => {
    it('converts supply APR to daily-compounded APY', async () => {
      const fetcher: jest.Mocked<BlendPoolFetcher> = {
        getPools: jest.fn().mockResolvedValue([
          { poolAddress: 'pool-1', asset: 'USDC', supplyApr: 10, totalSupply: '500000' },
        ]),
        supply: jest.fn().mockResolvedValue('tx-blend-1'),
        withdraw: jest.fn().mockResolvedValue('500'),
      };

      const source = new BlendYieldSource(fetcher);
      const opps = await source.fetchOpportunities();

      expect(opps).toHaveLength(1);
      expect(opps[0].protocol).toBe('Blend');
      expect(opps[0].asset).toBe('USDC');
      // 10% APR daily-compounded → slightly above 10%
      expect(opps[0].apy).toBeGreaterThan(10);
      expect(opps[0].sourceId).toBe('pool-1');
    });

    it('routes deposit to the fetcher supply method', async () => {
      const fetcher: jest.Mocked<BlendPoolFetcher> = {
        getPools: jest.fn().mockResolvedValue([]),
        supply: jest.fn().mockResolvedValue('tx-supply-1'),
        withdraw: jest.fn().mockResolvedValue('100'),
      };

      const source = new BlendYieldSource(fetcher);
      const opp = opportunity('Blend', 'USDC', 8.0, '500000', 'pool-addr');
      const result = await source.deposit(opp, '200');

      expect(fetcher.supply).toHaveBeenCalledWith('pool-addr', 'USDC', '200');
      expect(result.txId).toBe('tx-supply-1');
    });
  });

  describe('SoroswapYieldSource', () => {
    it('derives APY from volume, TVL, and fee tier', async () => {
      const fetcher: jest.Mocked<SoroswapPoolFetcher> = {
        getPools: jest.fn().mockResolvedValue([
          { pairAddress: 'pair-1', asset: 'XLM', volume24h: 100_000, tvl: 1_000_000, feeTier: 0.003 },
        ]),
        addLiquidity: jest.fn().mockResolvedValue('lp-tokens-100'),
        removeLiquidity: jest.fn().mockResolvedValue('100'),
      };

      const source = new SoroswapYieldSource(fetcher);
      const opps = await source.fetchOpportunities();

      expect(opps).toHaveLength(1);
      expect(opps[0].protocol).toBe('Soroswap');
      // (100000 * 0.003 / 1000000) * 365 * 100 ≈ 10.95% APR, then daily-compounded
      expect(opps[0].apy).toBeGreaterThan(10);
      expect(opps[0].apy).toBeLessThan(15);
    });

    it('excludes pools with zero TVL', async () => {
      const fetcher: jest.Mocked<SoroswapPoolFetcher> = {
        getPools: jest.fn().mockResolvedValue([
          { pairAddress: 'pair-empty', asset: 'XLM', volume24h: 0, tvl: 0, feeTier: 0.003 },
        ]),
        addLiquidity: jest.fn(),
        removeLiquidity: jest.fn(),
      };

      const source = new SoroswapYieldSource(fetcher);
      expect(await source.fetchOpportunities()).toHaveLength(0);
    });
  });

  describe('VaultYieldSource', () => {
    it('passes vault APY through directly without conversion', async () => {
      const fetcher: jest.Mocked<VaultStrategyFetcher> = {
        getStrategies: jest.fn().mockResolvedValue([
          { contractId: 'vault-1', asset: 'USDC', apyPct: 18.5, tvl: '2000000' },
        ]),
        deposit: jest.fn().mockResolvedValue('shares-500'),
        withdraw: jest.fn().mockResolvedValue('500'),
      };

      const source = new VaultYieldSource(fetcher);
      const opps = await source.fetchOpportunities();

      expect(opps).toHaveLength(1);
      expect(opps[0].apy).toBe(18.5);  // no conversion — already APY
      expect(opps[0].protocol).toBe('Vault');
    });

    it('routes deposit to the fetcher deposit method', async () => {
      const fetcher: jest.Mocked<VaultStrategyFetcher> = {
        getStrategies: jest.fn().mockResolvedValue([]),
        deposit: jest.fn().mockResolvedValue('shares-1000'),
        withdraw: jest.fn().mockResolvedValue('1000'),
      };

      const source = new VaultYieldSource(fetcher);
      const opp = opportunity('Vault', 'USDC', 18.5, '2000000', 'vault-contract-1');
      const result = await source.deposit(opp, '1000');

      expect(fetcher.deposit).toHaveBeenCalledWith('vault-contract-1', '1000');
      expect(result.sharesReceived).toBe('shares-1000');
    });
  });
});