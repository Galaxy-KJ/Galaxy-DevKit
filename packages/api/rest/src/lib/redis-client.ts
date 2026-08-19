/**
 * @fileoverview Shared Redis client for rate-limit counters.
 * @description Lazily created on first use so importing this module never
 *              throws in environments without Redis configured. Callers are
 *              responsible for explicit fail-open/fail-closed handling when
 *              this returns null — we never silently substitute in-memory
 *              storage from inside this module.
 * @author Galaxy DevKit Team
 */

import Redis from 'ioredis';

let client: Redis | null = null;
let connectionFailed = false;

export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url || connectionFailed) return null;

  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        // Give up quickly rather than hammering a dead Redis; request-path
        // code needs a fast, deterministic answer to apply its fail-open/
        // fail-closed policy.
        if (times > 3) {
          connectionFailed = true;
          return null;
        }
        return Math.min(times * 100, 1000);
      },
    });

    client.on('error', (err) => {
      console.error('[redis-client] connection error:', err.message);
    });
  }

  return client;
}

export function isRedisHealthy(): boolean {
  return client !== null && client.status === 'ready';
}

/** Test-only: reset singleton state between test suites. */
export function __resetRedisClientForTests(): void {
  client = null;
  connectionFailed = false;
}