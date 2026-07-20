/**
 * @fileoverview Timeout wrapper for health check promises.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

export class HealthCheckTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`Health check "${name}" timed out after ${timeoutMs}ms`);
    this.name = 'HealthCheckTimeoutError';
  }
}

export function withTimeout<T>(
  name: string,
  timeoutMs: number,
  op: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new HealthCheckTimeoutError(name, timeoutMs));
    }, timeoutMs);
    timer.unref?.();

    op().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
