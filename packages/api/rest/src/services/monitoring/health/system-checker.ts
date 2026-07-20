/**
 * @fileoverview Health checker for local process resources.
 * @description Samples RSS memory and event-loop delay against configurable
 *              high watermarks. Non-critical: a spike degrades /health but the
 *              process may still be serving requests.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks';
import { ComponentHealth, HealthChecker, HealthStatus } from '../../../types/monitoring-health-types';
import { monitoringConfig } from '../../../config/monitoring-config';

export interface SystemMetricsSnapshot {
  rssBytes: number;
  heapUsedBytes: number;
  eventLoopLagMs: number;
}

export type SystemSampler = () => SystemMetricsSnapshot;

function defaultSampler(histogram: IntervalHistogram): SystemSampler {
  return () => {
    const mem = process.memoryUsage();
    const lagMs = histogram.max / 1e6;
    histogram.reset();
    return {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      eventLoopLagMs: Number.isFinite(lagMs) ? lagMs : 0,
    };
  };
}

export class SystemHealthChecker implements HealthChecker {
  readonly name = 'system';
  readonly critical = false;

  private readonly sampler: SystemSampler;
  private readonly memoryHighWatermarkBytes: number;
  private readonly eventLoopLagHighMs: number;
  private readonly histogram?: IntervalHistogram;

  constructor(opts?: {
    sampler?: SystemSampler;
    memoryHighWatermarkBytes?: number;
    eventLoopLagHighMs?: number;
  }) {
    this.memoryHighWatermarkBytes =
      opts?.memoryHighWatermarkBytes ?? monitoringConfig.system.memoryHighWatermarkBytes;
    this.eventLoopLagHighMs =
      opts?.eventLoopLagHighMs ?? monitoringConfig.system.eventLoopLagHighWatermarkMs;

    if (opts?.sampler) {
      this.sampler = opts.sampler;
    } else {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
      this.sampler = defaultSampler(this.histogram);
    }
  }

  async check(): Promise<ComponentHealth> {
    const started = Date.now();
    const snapshot = this.sampler();

    let status: HealthStatus = 'up';
    const reasons: string[] = [];
    if (snapshot.rssBytes > this.memoryHighWatermarkBytes) {
      status = 'degraded';
      reasons.push('rss above watermark');
    }
    if (snapshot.eventLoopLagMs > this.eventLoopLagHighMs) {
      status = 'degraded';
      reasons.push('event loop lag above watermark');
    }

    return {
      name: this.name,
      status,
      latencyMs: Date.now() - started,
      message: reasons.length > 0 ? reasons.join('; ') : undefined,
      details: {
        rssBytes: snapshot.rssBytes,
        heapUsedBytes: snapshot.heapUsedBytes,
        eventLoopLagMs: Number(snapshot.eventLoopLagMs.toFixed(2)),
        memoryHighWatermarkBytes: this.memoryHighWatermarkBytes,
        eventLoopLagHighMs: this.eventLoopLagHighMs,
      },
    };
  }
}
