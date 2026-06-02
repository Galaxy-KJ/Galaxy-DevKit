/**
 * @fileoverview Auto-compounding yield strategy for Blend + Soroswap positions
 */

import type { Keypair } from '@stellar/stellar-sdk';
import {
  optimizeHarvestTiming,
  estimateCompoundedApy,
  type HarvestOptimizerInput,
} from './harvest-optimizer.js';

export interface CompoundAuditEvent {
  timestamp: Date;
  action: 'harvest' | 'reinvest' | 'skip';
  yieldHarvested: string;
  gasSpent: string;
  netGain: string;
  details: Record<string, unknown>;
}

export interface HarvestResult {
  yieldHarvested: string;
  gasSpent: string;
  netGain: string;
  nextHarvestAt: Date;
}

export interface AutoCompoundConfig {
  /** Base APY before compounding (percent, e.g. 8.5) */
  baseApyPercent: number;
  /** Estimated harvests per year when fully optimized */
  harvestsPerYear?: number;
  /** Minimum net gain to execute harvest */
  minNetGain?: number;
  /** Minimum interval between harvests (ms) */
  minHarvestIntervalMs?: number;
  gasCostEstimate?: number;
  fetchPendingYield?: () => Promise<number>;
  reinvest?: (amount: number, keypair: Keypair) => Promise<{ gasSpent: number; txHash?: string }>;
}

/**
 * Periodically harvests yield from active positions and reinvests when profitable.
 */
export class AutoCompoundStrategy {
  private readonly config: Required<Pick<AutoCompoundConfig, 'baseApyPercent'>> &
    AutoCompoundConfig;
  private lastHarvestAt: Date | null = null;
  private readonly auditLog: CompoundAuditEvent[] = [];

  constructor(config: AutoCompoundConfig) {
    this.config = config;
  }

  async shouldHarvest(): Promise<boolean> {
    const decision = await this.evaluateHarvest();
    if (!decision.shouldHarvest) {
      this.auditLog.push({
        timestamp: new Date(),
        action: 'skip',
        yieldHarvested: String(decision.pendingYield),
        gasSpent: String(decision.gasCost),
        netGain: String(decision.netGain),
        details: { reason: decision.reason },
      });
    }
    return decision.shouldHarvest;
  }

  async harvest(keypair: Keypair): Promise<HarvestResult> {
    const decision = await this.evaluateHarvest();
    if (!decision.shouldHarvest) {
      throw new Error(decision.reason);
    }

    const gasSpent = this.config.gasCostEstimate ?? decision.gasCost;
    let reinvestGas = 0;
    let txHash: string | undefined;

    if (this.config.reinvest) {
      const reinvestResult = await this.config.reinvest(decision.pendingYield, keypair);
      reinvestGas = reinvestResult.gasSpent;
      txHash = reinvestResult.txHash;
    }

    const totalGas = gasSpent + reinvestGas;
    const netGain = decision.pendingYield - totalGas;
    const nextHarvestAt = new Date(Date.now() + decision.nextHarvestInMs);

    this.lastHarvestAt = new Date();
    const result: HarvestResult = {
      yieldHarvested: decision.pendingYield.toFixed(7),
      gasSpent: totalGas.toFixed(7),
      netGain: netGain.toFixed(7),
      nextHarvestAt,
    };

    this.auditLog.push({
      timestamp: new Date(),
      action: 'harvest',
      yieldHarvested: result.yieldHarvested,
      gasSpent: result.gasSpent,
      netGain: result.netGain,
      details: { txHash, nextHarvestAt: nextHarvestAt.toISOString() },
    });

    this.auditLog.push({
      timestamp: new Date(),
      action: 'reinvest',
      yieldHarvested: result.yieldHarvested,
      gasSpent: result.gasSpent,
      netGain: result.netGain,
      details: { txHash },
    });

    return result;
  }

  async getEstimatedAPY(): Promise<number> {
    const harvestsPerYear = this.config.harvestsPerYear ?? 52;
    return estimateCompoundedApy(this.config.baseApyPercent, harvestsPerYear);
  }

  getAuditLog(): CompoundAuditEvent[] {
    return [...this.auditLog];
  }

  private async evaluateHarvest(): Promise<ReturnType<typeof optimizeHarvestTiming> & {
    pendingYield: number;
    gasCost: number;
  }> {
    const pendingYield = this.config.fetchPendingYield
      ? await this.config.fetchPendingYield()
      : 0;
    const gasCost = this.config.gasCostEstimate ?? 0.001;
    const elapsedMs = this.lastHarvestAt ? Date.now() - this.lastHarvestAt.getTime() : Number.MAX_SAFE_INTEGER;

    const input: HarvestOptimizerInput = {
      pendingYield,
      gasCost,
      minNetGain: this.config.minNetGain,
      elapsedMs,
      minIntervalMs: this.config.minHarvestIntervalMs,
    };

    const decision = optimizeHarvestTiming(input);
    return { ...decision, pendingYield, gasCost };
  }
}

export { optimizeHarvestTiming, estimateCompoundedApy };
