/**
 * @fileoverview Configuration for health checks and metrics collection.
 * @description Reads env vars once at import time. Defaults chosen for
 *              container platforms where probes fire every 5-10s.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : fallback;
}

export const monitoringConfig = {
  healthCheckTimeoutMs: readInt('HEALTH_CHECK_TIMEOUT_MS', 3000),

  horizon: {
    url: readString('STELLAR_HORIZON_URL', 'https://horizon-testnet.stellar.org'),
  },

  oracle: {
    stalenessThresholdMs: readInt('ORACLE_STALENESS_THRESHOLD_MS', 60_000),
  },

  defi: {
    blendUrl: readString('BLEND_HEALTH_URL', 'https://api.blend.capital/health'),
    soroswapUrl: readString('SOROSWAP_HEALTH_URL', 'https://api.soroswap.finance/health'),
  },

  system: {
    memoryHighWatermarkBytes: readInt(
      'SYSTEM_MEMORY_HIGH_WATERMARK_BYTES',
      1024 * 1024 * 1024
    ),
    eventLoopLagHighWatermarkMs: readInt('SYSTEM_EVENT_LOOP_LAG_HIGH_MS', 200),
  },

  metrics: {
    prefix: readString('METRICS_PREFIX', 'galaxy_'),
  },
} as const;
