import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { auditRequest } from '../middleware/audit';
import { CustomMetricsService } from '../services/metrics/custom-metrics.service';
import { MetricsError } from '../types/custom-metrics';

/** All custom metric routes require authentication and use the authenticated owner. */
export function setupCustomMetricsRoutes(service = new CustomMetricsService()): express.Router {
  const router = express.Router();
  router.use(authenticate(), auditRequest());
  const handle = (operation: (req: Request, userId: string, res: Response) => Promise<void>) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      if (!req.user?.userId) { res.status(401).json({ error: { code: 'AUTH_ERROR', message: 'Authentication required' } }); return; }
      try { await operation(req, req.user.userId, res); }
      catch (error) {
        if (error instanceof MetricsError) res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
        else next(error);
      }
    };
  router.get('/definitions', handle(async (_req, owner, res) => { res.json({ definitions: await service.list(owner) }); }));
  router.post('/definitions', handle(async (req, owner, res) => { res.status(201).json({ definition: await service.save(owner, req.body) }); }));
  router.patch('/definitions/:id', handle(async (req, owner, res) => { res.json({ definition: await service.patch(owner, req.params.id, req.body) }); }));
  router.put('/definitions/:id', handle(async (req, owner, res) => { res.json({ definition: await service.save(owner, req.body, req.params.id) }); }));
  router.delete('/definitions/:id', handle(async (req, owner, res) => { await service.remove(owner, req.params.id); res.status(204).end(); }));
  router.post('/preview', handle(async (req, owner, res) => { res.json(await service.preview(owner, req.body)); }));
  router.get('/export', handle(async (_req, owner, res) => { res.json(await service.export(owner)); }));
  router.post('/import', handle(async (req, owner, res) => { res.status(201).json({ definitions: await service.import(owner, req.body) }); }));
  router.get('/:id/value', handle(async (req, owner, res) => {
    const filters: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value !== 'string') throw new MetricsError(400, 'INVALID_FILTER', 'Dimension filters must be strings');
      filters[key] = value;
    }
    res.json(await service.value(owner, req.params.id, filters));
  }));
  router.get('/:id/series', handle(async (req, owner, res) => {
    if (Object.keys(req.query).some(key => !['start', 'end', 'bucketMs'].includes(key)) || ['start', 'end', 'bucketMs'].some(key => typeof req.query[key] !== 'string')) throw new MetricsError(400, 'INVALID_SERIES', 'Provide ISO start/end and explicit bucketMs');
    res.json({ series: await service.series(owner, req.params.id, Date.parse(req.query.start as string), Date.parse(req.query.end as string), Number(req.query.bucketMs)) });
  }));
  return router;
}
