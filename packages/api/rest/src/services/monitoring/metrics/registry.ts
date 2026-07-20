/**
 * @fileoverview Prometheus registry singleton and default metrics setup.
 * @description Uses an isolated `Registry` (not prom-client's global one) so
 *              tests can reset state without leaking metrics between suites.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { Registry, collectDefaultMetrics } from 'prom-client';
import { monitoringConfig } from '../../../config/monitoring-config';

let registry: Registry | null = null;

export function getMetricsRegistry(): Registry {
  if (registry) return registry;

  registry = new Registry();
  collectDefaultMetrics({
    register: registry,
    prefix: monitoringConfig.metrics.prefix,
  });
  return registry;
}

/**
 * Test-only: wipe the registry so each suite starts from scratch.
 */
export function __resetMetricsRegistryForTests(): void {
  registry?.clear();
  registry = null;
}
