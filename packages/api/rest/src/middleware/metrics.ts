/**
 * @fileoverview Express middleware that records HTTP request count and latency
 *               into the Prometheus registry.
 * @description Uses `req.route?.path` (mounted route pattern) as the `route`
 *              label to keep cardinality bounded. Unmatched routes are
 *              labelled `unknown`. Latency is measured with `process.hrtime`
 *              for nanosecond precision and reported in seconds (Prometheus
 *              convention).
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import { NextFunction, Request, Response } from 'express';
import { getHttpMetrics, HttpMetrics } from '../services/monitoring/metrics/http-metrics';

const EXCLUDED_ROUTES = new Set<string>([
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
]);

function resolveRoute(req: Request): string {
  // `req.route` is populated once Express matches. `req.baseUrl` prefixes it
  // when the request went through a mounted router (e.g. /api/v1).
  const routePath = req.route?.path;
  if (routePath) {
    const base = req.baseUrl ?? '';
    return `${base}${routePath}` || '/';
  }
  return 'unknown';
}

export interface HttpMetricsMiddlewareOptions {
  metrics?: HttpMetrics;
  excludedPaths?: Set<string>;
}

export function httpMetricsMiddleware(options: HttpMetricsMiddlewareOptions = {}) {
  const metrics = options.metrics ?? getHttpMetrics();
  const excluded = options.excludedPaths ?? EXCLUDED_ROUTES;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (excluded.has(req.path)) {
      next();
      return;
    }

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const route = resolveRoute(req);
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      metrics.requestsTotal.inc(labels);
      metrics.requestDurationSeconds.observe(labels, durationSeconds);
    });

    next();
  };
}
