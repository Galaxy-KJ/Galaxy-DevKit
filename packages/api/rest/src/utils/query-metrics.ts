/**
 * @fileoverview Query execution time logging and slow query detection.
 * @description Wraps a Supabase query builder call (or any thenable) and logs
 *              a warning when it takes longer than SLOW_QUERY_THRESHOLD_MS
 *              (default 100ms) to resolve.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 100;

function getSlowQueryThresholdMs(): number {
  const raw = process.env.SLOW_QUERY_THRESHOLD_MS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SLOW_QUERY_THRESHOLD_MS;
}

/**
 * Times `fn` and logs a `[slow-query]` warning when execution exceeds the
 * configured threshold. `label` should identify the repository method and
 * table (e.g. "teams.listActivity") so slow query logs are actionable.
 */
export async function withQueryLogging<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const durationMs = Date.now() - start;
    const threshold = getSlowQueryThresholdMs();
    if (durationMs > threshold) {
      console.warn(`[slow-query] ${label} took ${durationMs}ms (threshold ${threshold}ms)`);
    }
  }
}

export { getSlowQueryThresholdMs };
