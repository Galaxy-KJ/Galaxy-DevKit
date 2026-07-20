/**
 * @fileoverview Domain-level metrics exposed by the API surface.
 * @description Provides thin, typed helpers that other services import to
 *              record Stellar Horizon calls, Oracle freshness, DeFi protocol
 *              calls and WebSocket activity. All series share a common prefix.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { monitoringConfig } from '../../../config/monitoring-config';
import { getMetricsRegistry } from './registry';

export interface DomainMetrics {
  horizonResponseSeconds: Histogram<string>;
  horizonErrorsTotal: Counter<string>;
  oracleFeedAgeSeconds: Gauge<string>;
  defiCallsTotal: Counter<string>;
  websocketConnections: Gauge<string>;
  websocketMessagesTotal: Counter<string>;
}

let cached: DomainMetrics | null = null;

export function getDomainMetrics(registry: Registry = getMetricsRegistry()): DomainMetrics {
  if (cached) return cached;

  const prefix = monitoringConfig.metrics.prefix;

  const horizonResponseSeconds = new Histogram({
    name: `${prefix}horizon_response_seconds`,
    help: 'Stellar Horizon response times in seconds by endpoint.',
    labelNames: ['endpoint'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  const horizonErrorsTotal = new Counter({
    name: `${prefix}horizon_errors_total`,
    help: 'Stellar Horizon errors by endpoint and reason.',
    labelNames: ['endpoint', 'reason'] as const,
    registers: [registry],
  });

  const oracleFeedAgeSeconds = new Gauge({
    name: `${prefix}oracle_feed_age_seconds`,
    help: 'Seconds since the oracle feed was last updated (freshness).',
    labelNames: ['feed'] as const,
    registers: [registry],
  });

  const defiCallsTotal = new Counter({
    name: `${prefix}defi_calls_total`,
    help: 'DeFi protocol calls by protocol, operation and outcome.',
    labelNames: ['protocol', 'operation', 'outcome'] as const,
    registers: [registry],
  });

  const websocketConnections = new Gauge({
    name: `${prefix}websocket_connections`,
    help: 'Currently open WebSocket connections by namespace.',
    labelNames: ['namespace'] as const,
    registers: [registry],
  });

  const websocketMessagesTotal = new Counter({
    name: `${prefix}websocket_messages_total`,
    help: 'WebSocket messages by namespace and direction.',
    labelNames: ['namespace', 'direction'] as const,
    registers: [registry],
  });

  cached = {
    horizonResponseSeconds,
    horizonErrorsTotal,
    oracleFeedAgeSeconds,
    defiCallsTotal,
    websocketConnections,
    websocketMessagesTotal,
  };
  return cached;
}

export function __resetDomainMetricsForTests(): void {
  cached = null;
}
