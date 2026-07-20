/**
 * @fileoverview Orchestrator that runs all registered health checkers in
 *               parallel, enforces per-check timeouts and aggregates results.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import {
  ComponentHealth,
  HealthChecker,
  HealthReport,
  HealthStatus,
} from '../../../types/monitoring-health-types';
import { monitoringConfig } from '../../../config/monitoring-config';
import { HealthCheckTimeoutError, withTimeout } from './with-timeout';

export interface HealthOrchestratorOptions {
  timeoutMs?: number;
  version?: string;
  now?: () => Date;
  startedAt?: Date;
}

/**
 * Rank statuses so we can compute the aggregate as the "worst" one.
 */
const STATUS_RANK: Record<HealthStatus, number> = { up: 0, degraded: 1, down: 2 };

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

export class HealthOrchestrator {
  private readonly checkers: readonly HealthChecker[];
  private readonly timeoutMs: number;
  private readonly version: string;
  private readonly now: () => Date;
  private readonly startedAt: Date;

  constructor(checkers: readonly HealthChecker[], options: HealthOrchestratorOptions = {}) {
    this.checkers = checkers;
    this.timeoutMs = options.timeoutMs ?? monitoringConfig.healthCheckTimeoutMs;
    this.version = options.version ?? process.env.npm_package_version ?? '0.0.0';
    this.now = options.now ?? (() => new Date());
    this.startedAt = options.startedAt ?? new Date();
  }

  async runAll(): Promise<HealthReport> {
    const components = await Promise.all(
      this.checkers.map((c) => this.runOne(c))
    );
    return {
      status: this.aggregate(components),
      timestamp: this.now().toISOString(),
      uptimeSeconds: Math.floor((this.now().getTime() - this.startedAt.getTime()) / 1000),
      version: this.version,
      components,
    };
  }

  /**
   * Readiness only considers `critical` components. Non-critical failures
   * degrade /health but must not evict the pod from the load balancer.
   */
  async runCritical(): Promise<HealthReport> {
    const critical = this.checkers.filter((c) => c.critical);
    const components = await Promise.all(critical.map((c) => this.runOne(c)));
    return {
      status: this.aggregate(components),
      timestamp: this.now().toISOString(),
      uptimeSeconds: Math.floor((this.now().getTime() - this.startedAt.getTime()) / 1000),
      version: this.version,
      components,
    };
  }

  private async runOne(checker: HealthChecker): Promise<ComponentHealth> {
    const started = Date.now();
    try {
      return await withTimeout(checker.name, this.timeoutMs, () => checker.check());
    } catch (err) {
      const latencyMs = Date.now() - started;
      const isTimeout = err instanceof HealthCheckTimeoutError;
      return {
        name: checker.name,
        status: 'down',
        latencyMs,
        message: err instanceof Error ? err.message : String(err),
        details: isTimeout ? { timeout: true, timeoutMs: this.timeoutMs } : undefined,
      };
    }
  }

  private aggregate(components: ComponentHealth[]): HealthStatus {
    return components.reduce<HealthStatus>((acc, c) => worst(acc, c.status), 'up');
  }
}
