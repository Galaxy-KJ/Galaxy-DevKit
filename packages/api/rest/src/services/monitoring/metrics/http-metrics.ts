/**
 * @fileoverview HTTP request metrics (counter + latency histogram).
 * @description Buckets tuned for API workloads: sub-ms to 10s. Labels are
 *              kept low-cardinality (method, route pattern, status). Route
 *              pattern comes from Express's `req.route.path`; unmatched
 *              requests are grouped as "unknown".
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { Counter, Histogram, Registry } from 'prom-client';
import { monitoringConfig } from '../../../config/monitoring-config';
import { getMetricsRegistry } from './registry';

export interface HttpMetrics {
  requestsTotal: Counter<string>;
  requestDurationSeconds: Histogram<string>;
}

let cached: HttpMetrics | null = null;

export function getHttpMetrics(registry: Registry = getMetricsRegistry()): HttpMetrics {
  if (cached) return cached;

  const prefix = monitoringConfig.metrics.prefix;

  const requestsTotal = new Counter({
    name: `${prefix}http_requests_total`,
    help: 'Total number of HTTP requests handled by the REST API.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });

  const requestDurationSeconds = new Histogram({
    name: `${prefix}http_request_duration_seconds`,
    help: 'HTTP request latency in seconds, labelled by method, route and status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  cached = { requestsTotal, requestDurationSeconds };
  return cached;
}

export function __resetHttpMetricsForTests(): void {
  cached = null;
}
