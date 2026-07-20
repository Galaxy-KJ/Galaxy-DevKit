/**
 * @fileoverview Types for real-time performance monitoring and health checks.
 * @description Public contract shared by health checkers, orchestrator and
 *              HTTP routes. Kept framework-agnostic so checkers stay portable.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

export type HealthStatus = 'up' | 'down' | 'degraded';

/**
 * Aggregate health of a single dependency (DB, Horizon, Oracle, DeFi, System).
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Full snapshot returned by GET /health.
 * `status` is the worst of the component statuses (weighted by `critical`).
 */
export interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  components: ComponentHealth[];
}

/**
 * Contract for anything that can be health-checked.
 *
 * `critical=true` means the checker's status feeds into readiness. A critical
 * component being `down` causes GET /health/ready to return 503, which tells
 * Kubernetes to remove the pod from the load balancer without killing it.
 */
export interface HealthChecker {
  readonly name: string;
  readonly critical: boolean;
  check(): Promise<ComponentHealth>;
}
