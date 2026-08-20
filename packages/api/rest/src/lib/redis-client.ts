/**
 * @fileoverview Shared Redis client for rate-limit counters.
 * @description Lazily created on first use so importing this module never
 *              throws in environments without Redis configured. Callers are
 *              responsible for explicit fail-open/fail-closed handling when
 *              this returns null — we never silently substitute in-memory
 *              storage from inside this module.
 * @author Galaxy DevKit Team
 */

interface RedisClient {
  incr(redisKey: string): any;
  expire(redisKey: string, arg1: number): unknown;
  ttl(redisKey: string): unknown;
  decr(arg0: string): unknown;
  del(arg0: string): unknown;
  call(arg0: string): any;
  set(breachKey: string, arg1: string, arg2: string, windowMs: number, arg4: string): unknown;
  on(event: 'error' | 'ready' | 'close', listener: (...args: any[]) => void): this;
}

interface RedisConstructor {
  new (url: string, options: {
    maxRetriesPerRequest: number;
    retryStrategy: (times: number) => number | null;
  }): RedisClient;
}

// Load lazily so this module can still be imported when Redis is not configured.
const Redis = (eval('require') as (moduleName: string) => RedisConstructor)('ioredis');

let client: RedisClient | null = null;
let connectionFailed = false;
let isReady = false;

export function getRedisClient(): RedisClient | null {
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
           isReady = false;
          return null;
        }
        return Math.min(times * 100, 1000);
      },
    });


    client.on('error', (err) => {
      console.error('[redis-client] connection error:', err.message);
      isReady = false;
    });
  }

  client.on('ready', () => {
      isReady = true;
      connectionFailed = false; // recovery: allow future getRedisClient() calls again
    });

  client.on('close', () => {
      isReady = false;
    });


  return client;
  }




export function isRedisHealthy(): boolean {
  return isReady;
}

/** Test-only: reset singleton state between test suites. */
export function __resetRedisClientForTests(): void {
  client = null;
  connectionFailed = false;
}