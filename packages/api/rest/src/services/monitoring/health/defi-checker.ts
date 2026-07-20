/**
 * @fileoverview Health checker for DeFi protocol reachability (Blend, Soroswap).
 * @description Pings each protocol's health URL in parallel. Marked
 *              non-critical: a failing protocol degrades /health but the API
 *              can still serve other traffic.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { ComponentHealth, HealthChecker, HealthStatus } from '../../../types/monitoring-health-types';
import { monitoringConfig } from '../../../config/monitoring-config';
import { Fetcher } from './horizon-checker';

interface ProtocolTarget {
  name: string;
  url: string;
}

interface ProtocolProbeResult {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  httpStatus?: number;
  error?: string;
}

const defaultFetcher: Fetcher = (input, init) =>
  fetch(input, init as RequestInit) as unknown as ReturnType<Fetcher>;

export class DefiProtocolHealthChecker implements HealthChecker {
  readonly name = 'defi-protocols';
  readonly critical = false;

  private readonly targets: ProtocolTarget[];
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(opts?: {
    targets?: ProtocolTarget[];
    fetcher?: Fetcher;
    timeoutMs?: number;
  }) {
    this.targets = opts?.targets ?? [
      { name: 'blend', url: monitoringConfig.defi.blendUrl },
      { name: 'soroswap', url: monitoringConfig.defi.soroswapUrl },
    ];
    this.fetcher = opts?.fetcher ?? defaultFetcher;
    this.timeoutMs = opts?.timeoutMs ?? monitoringConfig.healthCheckTimeoutMs;
  }

  async check(): Promise<ComponentHealth> {
    const started = Date.now();
    const results = await Promise.all(this.targets.map((t) => this.probe(t)));
    const latencyMs = Date.now() - started;

    const down = results.filter((r) => r.status === 'down');
    let status: HealthStatus = 'up';
    if (down.length === results.length && results.length > 0) status = 'down';
    else if (down.length > 0) status = 'degraded';

    return {
      name: this.name,
      status,
      latencyMs,
      message:
        down.length === 0
          ? undefined
          : `${down.length}/${results.length} DeFi protocols unreachable`,
      details: { protocols: results },
    };
  }

  private async probe(target: ProtocolTarget): Promise<ProtocolProbeResult> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    try {
      const res = await this.fetcher(target.url, {
        method: 'GET',
        signal: controller.signal,
      });
      return {
        name: target.name,
        status: res.ok ? 'up' : 'down',
        latencyMs: Date.now() - started,
        httpStatus: res.status,
      };
    } catch (err) {
      return {
        name: target.name,
        status: 'down',
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
