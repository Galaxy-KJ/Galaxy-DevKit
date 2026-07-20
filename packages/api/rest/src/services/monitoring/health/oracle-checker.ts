/**
 * @fileoverview Health checker for Oracle price feeds.
 * @description Determines freshness by comparing `now()` with the last-updated
 *              timestamp reported by a pluggable provider. Marked non-critical:
 *              stale prices degrade the system but do not warrant removing the
 *              pod from the load balancer.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { ComponentHealth, HealthChecker } from '../../../types/monitoring-health-types';
import { monitoringConfig } from '../../../config/monitoring-config';

export interface OracleFreshnessSnapshot {
  feed: string;
  lastUpdatedAt: Date;
}

export type OracleFreshnessProvider = () => Promise<OracleFreshnessSnapshot[]>;

/**
 * Placeholder provider used until the oracle service exposes a freshness API.
 * Returns an empty snapshot so the checker reports `up` with `details.reason`.
 * Replace by injecting a real provider when the oracle client is wired.
 */
const defaultProvider: OracleFreshnessProvider = async () => [];

export class OracleHealthChecker implements HealthChecker {
  readonly name = 'oracle-feeds';
  readonly critical = false;

  private readonly provider: OracleFreshnessProvider;
  private readonly stalenessMs: number;
  private readonly now: () => Date;

  constructor(opts?: {
    provider?: OracleFreshnessProvider;
    stalenessMs?: number;
    now?: () => Date;
  }) {
    this.provider = opts?.provider ?? defaultProvider;
    this.stalenessMs = opts?.stalenessMs ?? monitoringConfig.oracle.stalenessThresholdMs;
    this.now = opts?.now ?? (() => new Date());
  }

  async check(): Promise<ComponentHealth> {
    const started = Date.now();
    try {
      const snapshots = await this.provider();
      const latencyMs = Date.now() - started;

      if (snapshots.length === 0) {
        return {
          name: this.name,
          status: 'up',
          latencyMs,
          details: { reason: 'no oracle provider wired', feeds: 0 },
        };
      }

      const nowMs = this.now().getTime();
      const stale = snapshots.filter(
        (s) => nowMs - s.lastUpdatedAt.getTime() > this.stalenessMs
      );

      return {
        name: this.name,
        status: stale.length === 0 ? 'up' : 'degraded',
        latencyMs,
        message:
          stale.length === 0
            ? undefined
            : `${stale.length}/${snapshots.length} oracle feeds are stale`,
        details: {
          totalFeeds: snapshots.length,
          staleFeeds: stale.map((s) => s.feed),
          stalenessThresholdMs: this.stalenessMs,
        },
      };
    } catch (err) {
      return {
        name: this.name,
        status: 'down',
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
