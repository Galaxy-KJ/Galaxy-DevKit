/**
 * @fileoverview Health checker for Stellar Horizon.
 * @description Fetches the Horizon root document. HTTP 2xx = up.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { ComponentHealth, HealthChecker } from '../../../types/monitoring-health-types';
import { monitoringConfig } from '../../../config/monitoring-config';

export type Fetcher = (
  input: string,
  init?: { method?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const defaultFetcher: Fetcher = (input, init) =>
  fetch(input, init as RequestInit) as unknown as ReturnType<Fetcher>;

export class HorizonHealthChecker implements HealthChecker {
  readonly name = 'stellar-horizon';
  readonly critical = true;

  private readonly url: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;

  constructor(opts?: { url?: string; fetcher?: Fetcher; timeoutMs?: number }) {
    this.url = opts?.url ?? monitoringConfig.horizon.url;
    this.fetcher = opts?.fetcher ?? defaultFetcher;
    this.timeoutMs = opts?.timeoutMs ?? monitoringConfig.healthCheckTimeoutMs;
  }

  async check(): Promise<ComponentHealth> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    try {
      const res = await this.fetcher(this.url, {
        method: 'GET',
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;

      if (!res.ok) {
        return {
          name: this.name,
          status: 'down',
          latencyMs,
          message: `Horizon responded with HTTP ${res.status}`,
          details: { url: this.url, httpStatus: res.status },
        };
      }

      return {
        name: this.name,
        status: 'up',
        latencyMs,
        details: { url: this.url, httpStatus: res.status },
      };
    } catch (err) {
      return {
        name: this.name,
        status: 'down',
        latencyMs: Date.now() - started,
        message: err instanceof Error ? err.message : String(err),
        details: { url: this.url },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
