/**
 * @fileoverview Health check endpoints (detailed / liveness / readiness).
 * @description
 *  - GET /health          Full component-level report. 200 if any component is
 *                         up or degraded, 503 if the aggregate is down.
 *  - GET /health/live     Liveness probe. Always 200 while the process is up.
 *                         Kubernetes uses this to decide when to restart the
 *                         container - it must not depend on external systems.
 *  - GET /health/ready    Readiness probe. 200 only when every critical
 *                         dependency is up. Kubernetes removes the pod from
 *                         the load balancer on 503 without restarting it.
 * @author Galaxy DevKit Team
 * @since 2026-07-19
 */

import express, { Request, Response } from 'express';
import { HealthOrchestrator } from '../../services/monitoring/health';

export interface HealthRoutesDeps {
  orchestrator: HealthOrchestrator;
}

function httpStatusFor(status: 'up' | 'down' | 'degraded'): number {
  return status === 'down' ? 503 : 200;
}

export function setupHealthRoutes({ orchestrator }: HealthRoutesDeps): express.Router {
  const router = express.Router();

  router.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'up',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  router.get('/health/ready', async (_req: Request, res: Response) => {
    const report = await orchestrator.runCritical();
    res.status(httpStatusFor(report.status)).json(report);
  });

  router.get('/health', async (_req: Request, res: Response) => {
    const report = await orchestrator.runAll();
    res.status(httpStatusFor(report.status)).json(report);
  });

  return router;
}
