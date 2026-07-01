/**
 * @fileoverview Yield Farming Aggregator Service
 * @description Evaluates yield opportunities across Blend lending pools,
 *              Soroswap liquidity pools, and internal Vault strategies.
 *              Provides a unified interface to query APY rates and deposit
 *              assets into the highest-yielding source automatically.
 *
 * Roadmap item #43 / Issue #298.
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────────────────────
 * The aggregator is protocol-agnostic at construction time. Each yield source
 * is represented by a {@link YieldSource} adapter that the caller registers.
 * Three concrete adapters ship out-of-the-box:
 *
 *   BlendYieldSource    — wraps Blend pool supply APR
 *   SoroswapYieldSource — derives fee APY from 24h volume / TVL
 *   VaultYieldSource    — reads APY from a YieldVault strategy config
 *
 * This keeps the aggregator testable without real network calls (inject mocks)
 * and extensible (add new protocols by implementing YieldSource).
 *
 * @author Galaxy DevKit Team
 */

import BigNumber from 'bignumber.js';
import { aprToApyByFrequency, CompoundingFrequency, calculateLpApy } from '../utils/yield-calculator.js';

// ── Public types ──────────────────────────────────────────────────────────────

/** A single yield-bearing opportunity surfaced to the caller. */
export interface YieldOpportunity {
  /** Human-readable protocol name, e.g. "Blend", "Soroswap", "Vault". */
  protocol: string;
  /** Asset code the opportunity is denominated in, e.g. "USDC", "XLM". */
  asset: string;
  /**
   * Effective annual percentage yield as a percentage.
   * 10 = 10% APY. Always the compounded/effective rate for fair comparison.
   */
  apy: number;
  /**
   * Total value locked in the source, as a decimal string in the asset's
   * native units. Useful for slippage estimation before depositing.
   */
  tvl: string;
  /**
   * Opaque reference forwarded to the source adapter on deposit.
   * For Blend: pool address. For Soroswap: pair address. For Vault: contract ID.
   */
  sourceId: string;
}

/** Result returned by a successful deposit call. */
export interface DepositResult {
  /** Transaction hash or operation ID. */
  txId: string;
  /** Amount of the asset actually deposited (may differ due to fees). */
  amountDeposited: string;
  /** Number of shares, LP tokens, or bTokens received. */
  sharesReceived: string;
  /** The opportunity that was used. */
  opportunity: YieldOpportunity;
}

/** Result of a rebalance operation. */
export interface RebalanceResult {
  /** Opportunities that funds were moved from. */
  exited: Array<{ opportunity: YieldOpportunity; amountWithdrawn: string }>;
  /** Opportunity that funds were moved into. */
  entered: { opportunity: YieldOpportunity; amountDeposited: string };
  /** Net APY improvement in percentage points. */
  apyGainPct: number;
}

/** Minimum APY improvement (in percentage points) required to trigger a rebalance. */
const DEFAULT_REBALANCE_THRESHOLD_PCT = 0.5;

// ── YieldSource adapter interface ─────────────────────────────────────────────

/**
 * Adapter interface that every yield source must implement.
 * Inject a mock in tests; provide a real implementation in production.
 */
export interface YieldSource {
  /** Unique identifier matching {@link YieldOpportunity.protocol}. */
  readonly protocol: string;

  /**
   * Fetch all available opportunities from this source.
   * Called by the aggregator on every {@link YieldFarmingAggregator.getOpportunities} call.
   */
  fetchOpportunities(): Promise<YieldOpportunity[]>;

  /**
   * Deposit `amount` into the given opportunity.
   * @returns A {@link DepositResult} with the transaction ID and received shares.
   */
  deposit(opportunity: YieldOpportunity, amount: string): Promise<DepositResult>;

  /**
   * Withdraw from an opportunity. Used during rebalancing.
   * @returns The amount actually withdrawn (as a decimal string).
   */
  withdraw(opportunity: YieldOpportunity, amount: string): Promise<string>;
}

// ── Blend adapter ─────────────────────────────────────────────────────────────

/** Minimal shape of a Blend pool returned by the SDK. */
export interface BlendPoolInfo {
  poolAddress: string;
  asset: string;
  supplyApr: number;   // nominal APR as a percentage
  totalSupply: string; // TVL in asset units
}

/** Fetcher interface for Blend pool data — inject a mock in tests. */
export interface BlendPoolFetcher {
  getPools(): Promise<BlendPoolInfo[]>;
  supply(poolAddress: string, asset: string, amount: string): Promise<string>;
  withdraw(poolAddress: string, asset: string, amount: string): Promise<string>;
}

/**
 * Yield source adapter for Blend lending pools.
 * Converts Blend's nominal supply APR to an effective APY using daily
 * compounding (matching how Blend accrues interest per-ledger).
 */
export class BlendYieldSource implements YieldSource {
  readonly protocol = 'Blend';

  constructor(private readonly fetcher: BlendPoolFetcher) {}

  async fetchOpportunities(): Promise<YieldOpportunity[]> {
    const pools = await this.fetcher.getPools();
    return pools.map((pool) => ({
      protocol: this.protocol,
      asset: pool.asset,
      // Blend accrues per-ledger; daily is a safe practical approximation
      apy: aprToApyByFrequency(pool.supplyApr, CompoundingFrequency.Daily),
      tvl: pool.totalSupply,
      sourceId: pool.poolAddress,
    }));
  }

  async deposit(opportunity: YieldOpportunity, amount: string): Promise<DepositResult> {
    const txId = await this.fetcher.supply(opportunity.sourceId, opportunity.asset, amount);
    return {
      txId,
      amountDeposited: amount,
      sharesReceived: amount, // bTokens are 1:1 at supply time
      opportunity,
    };
  }

  async withdraw(opportunity: YieldOpportunity, amount: string): Promise<string> {
    return this.fetcher.withdraw(opportunity.sourceId, opportunity.asset, amount);
  }
}

// ── Soroswap adapter ──────────────────────────────────────────────────────────

/** Minimal shape of a Soroswap pool. */
export interface SoroswapPoolInfo {
  pairAddress: string;
  asset: string;      // base asset code
  volume24h: number;  // 24-hour trading volume in USD
  tvl: number;        // total value locked in USD
  feeTier: number;    // e.g. 0.003 for 0.30%
}

/** Fetcher interface for Soroswap pool data. */
export interface SoroswapPoolFetcher {
  getPools(): Promise<SoroswapPoolInfo[]>;
  addLiquidity(pairAddress: string, asset: string, amount: string): Promise<string>;
  removeLiquidity(pairAddress: string, asset: string, lpTokens: string): Promise<string>;
}

/**
 * Yield source adapter for Soroswap liquidity pools.
 * Derives APY from the 24h volume, TVL, and fee tier using the LP yield
 * calculator already present in the package.
 */
export class SoroswapYieldSource implements YieldSource {
  readonly protocol = 'Soroswap';

  constructor(private readonly fetcher: SoroswapPoolFetcher) {}

  async fetchOpportunities(): Promise<YieldOpportunity[]> {
    const pools = await this.fetcher.getPools();
    return pools
      .filter((pool) => pool.tvl > 0)
      .map((pool) => ({
        protocol: this.protocol,
        asset: pool.asset,
        // Fee APY with daily reinvestment — matches calculateLpApy default
        apy: calculateLpApy(pool.volume24h, pool.tvl, pool.feeTier, CompoundingFrequency.Daily),
        tvl: pool.tvl.toFixed(7),
        sourceId: pool.pairAddress,
      }));
  }

  async deposit(opportunity: YieldOpportunity, amount: string): Promise<DepositResult> {
    const lpTokens = await this.fetcher.addLiquidity(
      opportunity.sourceId,
      opportunity.asset,
      amount,
    );
    return {
      txId: lpTokens,
      amountDeposited: amount,
      sharesReceived: lpTokens,
      opportunity,
    };
  }

  async withdraw(opportunity: YieldOpportunity, amount: string): Promise<string> {
    return this.fetcher.removeLiquidity(opportunity.sourceId, opportunity.asset, amount);
  }
}

// ── Vault adapter ─────────────────────────────────────────────────────────────

/** Minimal shape of a Vault strategy config. */
export interface VaultStrategyInfo {
  contractId: string;
  asset: string;
  apyPct: number;   // effective APY already computed by the vault contract
  tvl: string;      // total assets under management
}

/** Fetcher interface for Vault strategy data. */
export interface VaultStrategyFetcher {
  getStrategies(): Promise<VaultStrategyInfo[]>;
  deposit(contractId: string, amount: string): Promise<string>;
  withdraw(contractId: string, shares: string): Promise<string>;
}

/**
 * Yield source adapter for internal YieldVault strategies.
 * Reads the APY directly from the vault's on-chain config — no derivation
 * needed since the vault already reports an effective compounded yield.
 */
export class VaultYieldSource implements YieldSource {
  readonly protocol = 'Vault';

  constructor(private readonly fetcher: VaultStrategyFetcher) {}

  async fetchOpportunities(): Promise<YieldOpportunity[]> {
    const strategies = await this.fetcher.getStrategies();
    return strategies.map((s) => ({
      protocol: this.protocol,
      asset: s.asset,
      apy: s.apyPct,
      tvl: s.tvl,
      sourceId: s.contractId,
    }));
  }

  async deposit(opportunity: YieldOpportunity, amount: string): Promise<DepositResult> {
    const shares = await this.fetcher.deposit(opportunity.sourceId, amount);
    return {
      txId: shares,
      amountDeposited: amount,
      sharesReceived: shares,
      opportunity,
    };
  }

  async withdraw(opportunity: YieldOpportunity, amount: string): Promise<string> {
    return this.fetcher.withdraw(opportunity.sourceId, amount);
  }
}

// ── YieldFarmingAggregator ────────────────────────────────────────────────────

/** Options for the aggregator constructor. */
export interface YieldFarmingAggregatorOptions {
  /**
   * Minimum APY improvement (in percentage points) required to trigger an
   * automatic rebalance via {@link YieldFarmingAggregator.rebalance}.
   * @default 0.5
   */
  rebalanceThresholdPct?: number;
}

/**
 * Aggregates yield opportunities across Blend, Soroswap, and Vault protocols
 * and routes deposits to the highest-APY source.
 *
 * @example
 * ```ts
 * const aggregator = new YieldFarmingAggregator(
 *   [new BlendYieldSource(blendFetcher), new SoroswapYieldSource(soroswapFetcher)],
 *   { rebalanceThresholdPct: 1.0 },
 * );
 *
 * const opportunities = await aggregator.getOpportunities();
 * const best = await aggregator.getBestOpportunity('USDC');
 * const result = await aggregator.deposit(best, '1000');
 * ```
 */
export class YieldFarmingAggregator {
  private readonly sources: YieldSource[];
  private readonly rebalanceThresholdPct: number;

  constructor(
    sources: YieldSource[] = [],
    options: YieldFarmingAggregatorOptions = {},
  ) {
    this.sources = sources;
    this.rebalanceThresholdPct = options.rebalanceThresholdPct ?? DEFAULT_REBALANCE_THRESHOLD_PCT;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Fetch and aggregate yield opportunities from all registered sources.
   * Results are sorted by APY descending.
   */
  async getOpportunities(): Promise<YieldOpportunity[]> {
    const settled = await Promise.allSettled(
      this.sources.map((s) => s.fetchOpportunities()),
    );

    const all: YieldOpportunity[] = [];
    for (const result of settled) {
      if (result.status === 'fulfilled') {
        all.push(...result.value);
      } else {
        // A single failing source must not block the rest
        console.warn('[YieldFarmingAggregator] source fetch failed:', result.reason);
      }
    }

    return all.sort((a, b) => b.apy - a.apy);
  }

  /**
   * Return the highest-APY opportunity for a specific asset.
   * Returns `undefined` when no opportunities are available for that asset.
   */
  async getBestOpportunity(asset: string): Promise<YieldOpportunity | undefined> {
    const opportunities = await this.getOpportunities();
    return opportunities.find(
      (o) => o.asset.toUpperCase() === asset.toUpperCase(),
    );
  }

  /**
   * Deposit `amount` of `opportunity.asset` into the given opportunity.
   * Delegates to the matching source adapter.
   *
   * @param opportunity  The target opportunity (from {@link getOpportunities}).
   * @param amount       Amount to deposit as a decimal string (e.g. "1000").
   * @returns A {@link DepositResult} with the transaction ID and shares received.
   */
  async deposit(opportunity: YieldOpportunity, amount: string): Promise<DepositResult> {
    this.validateAmount(amount);

    const source = this.findSource(opportunity.protocol);
    return source.deposit(opportunity, amount);
  }

  /**
   * Withdraw `amount` from an opportunity.
   * Returns the amount actually withdrawn as a decimal string.
   */
  async withdraw(opportunity: YieldOpportunity, amount: string): Promise<string> {
    this.validateAmount(amount);

    const source = this.findSource(opportunity.protocol);
    return source.withdraw(opportunity, amount);
  }

  /**
   * Deposit `amount` into the highest-APY opportunity for `asset`.
   * Convenience wrapper over {@link getBestOpportunity} + {@link deposit}.
   *
   * @throws {Error} when no opportunities are available for the asset.
   */
  async depositOptimal(asset: string, amount: string): Promise<DepositResult> {
    this.validateAmount(amount);

    const best = await this.getBestOpportunity(asset);
    if (!best) {
      throw new Error(
        `No yield opportunities available for asset "${asset}"`,
      );
    }

    return this.deposit(best, amount);
  }

  /**
   * Rebalance from a set of current positions into the highest-APY opportunity.
   *
   * The rebalance only executes when the best available APY exceeds the
   * highest current position APY by at least `rebalanceThresholdPct`.
   *
   * @param currentPositions  Existing positions to exit (from oldest/lowest APY first).
   * @param totalAmount       Total amount to rebalance (sum of all positions).
   * @param asset             Asset being rebalanced.
   * @returns A {@link RebalanceResult}, or `null` when no rebalance is warranted.
   */
  async rebalance(
    currentPositions: Array<{ opportunity: YieldOpportunity; amount: string }>,
    totalAmount: string,
    asset: string,
  ): Promise<RebalanceResult | null> {
    if (currentPositions.length === 0) return null;

    const best = await this.getBestOpportunity(asset);
    if (!best) return null;

    const currentMaxApy = Math.max(...currentPositions.map((p) => p.opportunity.apy));
    const gain = new BigNumber(best.apy).minus(currentMaxApy);

    if (gain.isLessThan(this.rebalanceThresholdPct)) {
      return null; // improvement below threshold — do nothing
    }

    // Exit all current positions
    const exited: RebalanceResult['exited'] = [];
    for (const position of currentPositions) {
      const withdrawn = await this.withdraw(position.opportunity, position.amount);
      exited.push({ opportunity: position.opportunity, amountWithdrawn: withdrawn });
    }

    // Enter the best opportunity with the full amount
    const depositResult = await this.deposit(best, totalAmount);

    return {
      exited,
      entered: { opportunity: best, amountDeposited: depositResult.amountDeposited },
      apyGainPct: gain.toNumber(),
    };
  }

  /**
   * Compute a weighted average APY across a set of positions.
   * Useful for portfolio-level reporting.
   *
   * @param positions  Array of { opportunity, amount } pairs.
   * @returns Weighted average APY as a percentage, or 0 for empty input.
   */
  weightedAverageApy(
    positions: Array<{ opportunity: YieldOpportunity; amount: string }>,
  ): number {
    if (positions.length === 0) return 0;

    const total = positions.reduce(
      (sum, p) => sum.plus(p.amount),
      new BigNumber(0),
    );

    if (total.isZero()) return 0;

    const weighted = positions.reduce((sum, p) => {
      const weight = new BigNumber(p.amount).dividedBy(total);
      return sum.plus(weight.multipliedBy(p.opportunity.apy));
    }, new BigNumber(0));

    return weighted.decimalPlaces(8, BigNumber.ROUND_HALF_UP).toNumber();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private findSource(protocol: string): YieldSource {
    const source = this.sources.find((s) => s.protocol === protocol);
    if (!source) {
      throw new Error(
        `No yield source registered for protocol "${protocol}". ` +
        `Registered: ${this.sources.map((s) => s.protocol).join(', ')}`,
      );
    }
    return source;
  }

  private validateAmount(amount: string): void {
    const bn = new BigNumber(amount);
    if (!bn.isFinite() || bn.isLessThanOrEqualTo(0)) {
      throw new Error(`amount must be a positive numeric string, got "${amount}"`);
    }
  }
}