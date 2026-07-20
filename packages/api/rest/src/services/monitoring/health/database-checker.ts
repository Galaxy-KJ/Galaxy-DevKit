/**
 * @fileoverview Health checker for the Supabase/Postgres backing store.
 * @description Issues a lightweight ping via the service-role client.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../../utils/supabase';
import { ComponentHealth, HealthChecker } from '../../../types/monitoring-health-types';

export type DatabasePinger = () => Promise<void>;

/**
 * Default ping: HEAD count on `api_keys` (chosen because it exists in every
 * environment and RLS does not block the service-role client). Kept as a
 * single, cheap round-trip. Swap via constructor for tests or alt schemas.
 */
function defaultPing(client: SupabaseClient): DatabasePinger {
  return async () => {
    const { error } = await client
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    if (error) throw new Error(error.message);
  };
}

export class DatabaseHealthChecker implements HealthChecker {
  readonly name = 'database';
  readonly critical = true;

  private readonly customPing?: DatabasePinger;
  private cachedPing?: DatabasePinger;

  constructor(ping?: DatabasePinger) {
    this.customPing = ping;
  }

  async check(): Promise<ComponentHealth> {
    const started = Date.now();
    try {
      const ping = this.resolvePing();
      await ping();
      return {
        name: this.name,
        status: 'up',
        latencyMs: Date.now() - started,
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

  /**
   * Lazy so a missing SUPABASE_URL surfaces as a "down" component instead of
   * crashing the process at startup when the orchestrator is constructed.
   */
  private resolvePing(): DatabasePinger {
    if (this.customPing) return this.customPing;
    if (!this.cachedPing) {
      this.cachedPing = defaultPing(getSupabaseClient());
    }
    return this.cachedPing;
  }
}
