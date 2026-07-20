/**
 * @fileoverview Prometheus-compatible /metrics endpoint.
 * @description Renders the shared registry in Prometheus text format.
 *              Kept public by default so Prometheus scrapers can consume it;
 *              lock down with network policy or a reverse-proxy allowlist in
 *              production.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import express, { NextFunction, Request, Response } from 'express';
import { Registry } from 'prom-client';
import { getMetricsRegistry } from '../../services/monitoring/metrics';

export interface MetricsRoutesDeps {
  registry?: Registry;
}

export function setupMetricsRoutes(deps: MetricsRoutesDeps = {}): express.Router {
  const router = express.Router();
  const registry = deps.registry ?? getMetricsRegistry();

  router.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await registry.metrics();
      res.setHeader('Content-Type', registry.contentType);
      res.status(200).send(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
