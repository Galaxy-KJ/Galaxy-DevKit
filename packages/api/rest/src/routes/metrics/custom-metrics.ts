/**
 * @fileoverview Custom metrics and KPI definition engine routes.
 * @description Provides full CRUD for metric definitions, value evaluation with
 *              KPI targets and deltas, time-series charting data, preview for unsaved
 *              definitions, JSON import/export, and audit logging.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { MetricsError, MetricsService } from '../../services/metrics/metrics.service';
import { AuditLogger } from '../../services/audit-logger';
import {
  createMetricDefinitionSchema,
  importMetricDefinitionsSchema,
  listMetricDefinitionsQuerySchema,
  metricIdParamSchema,
  metricSeriesQuerySchema,
  metricValueQuerySchema,
  previewMetricSchema,
  updateMetricDefinitionSchema,
} from '../../validators/custom-metrics-validators';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function handleMetricsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof MetricsError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  next(err);
}

export function setupCustomMetricsRoutes(
  service: MetricsService = new MetricsService(),
  auditLogger?: AuditLogger
): express.Router {
  const router = express.Router();
  const logger = auditLogger ?? (process.env.SUPABASE_URL ? new AuditLogger() : ({ log: () => Promise.resolve() } as any));

  // All custom metrics routes require authentication and audit request context
  router.use(authenticate(), auditRequest());

  // ── Definitions CRUD ────────────────────────────────────────────────────────

  // GET /definitions/export — Export user's definitions as JSON
  router.get('/definitions/export', async (req: Request, res: Response, next: NextFunction) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const payload = await service.exportDefinitions(userId);
      res.json(payload);
    } catch (err) {
      handleMetricsError(err, res, next);
    }
  });

  // POST /definitions/import — Import definitions from JSON
  router.post(
    '/definitions/import',
    validate(importMetricDefinitionsSchema, 'body'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const result = await service.importDefinitions(userId, req.body);
        void logger.log({
          user_id: userId,
          action: 'metric_definition.import',
          resource: req.originalUrl,
          success: true,
          metadata: { importedCount: result.importedCount },
        });
        res.status(201).json(result);
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // POST /definitions — Create definition
  router.post(
    '/definitions',
    validate(createMetricDefinitionSchema, 'body'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const definition = await service.createDefinition(userId, req.body);
        void logger.log({
          user_id: userId,
          action: 'metric_definition.create',
          resource: req.originalUrl,
          resource_id: definition.id,
          success: true,
          metadata: { name: definition.name, source: definition.source, window: definition.window },
        });
        res.status(201).json({ definition });
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // GET /definitions — List user's definitions
  router.get(
    '/definitions',
    validate(listMetricDefinitionsQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const definitions = await service.listDefinitions(userId);
        res.json({ definitions });
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // GET /definitions/:id — Get one definition
  router.get(
    '/definitions/:id',
    validate(metricIdParamSchema, 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const definition = await service.getDefinition(req.params.id, userId);
        res.json({ definition });
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // PATCH /definitions/:id — Update definition
  router.patch(
    '/definitions/:id',
    validate(metricIdParamSchema, 'params'),
    validate(updateMetricDefinitionSchema, 'body'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const definition = await service.updateDefinition(req.params.id, userId, req.body);
        void logger.log({
          user_id: userId,
          action: 'metric_definition.update',
          resource: req.originalUrl,
          resource_id: definition.id,
          success: true,
          metadata: { patch: Object.keys(req.body) },
        });
        res.json({ definition });
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // DELETE /definitions/:id — Delete definition
  router.delete(
    '/definitions/:id',
    validate(metricIdParamSchema, 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        await service.deleteDefinition(req.params.id, userId);
        void logger.log({
          user_id: userId,
          action: 'metric_definition.delete',
          resource: req.originalUrl,
          resource_id: req.params.id,
          success: true,
        });
        res.status(204).send();
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // ── Evaluation & Analytics ──────────────────────────────────────────────────

  // POST /preview — Evaluate unsaved definition
  router.post(
    '/preview',
    validate(previewMetricSchema, 'body'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const result = await service.preview(req.body, userId);
        res.json(result);
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // GET /:id/value — Get current metric value, target, delta, trend
  router.get(
    '/:id/value',
    validate(metricIdParamSchema, 'params'),
    validate(metricValueQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const dimensionFilters = { ...(req.query as Record<string, string>) };
        const result = await service.getValue(req.params.id, userId, dimensionFilters);
        res.json(result);
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // GET /:id/series — Time series data for charting
  router.get(
    '/:id/series',
    validate(metricIdParamSchema, 'params'),
    validate(metricSeriesQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const bucket = (req.query.bucket as string) || '1h';
        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;

        const dimensionFilters: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.query)) {
          if (k !== 'bucket' && k !== 'from' && k !== 'to' && typeof v === 'string') {
            dimensionFilters[k] = v;
          }
        }

        const result = await service.getSeries(req.params.id, userId, {
          bucket,
          from,
          to,
          dimensionFilters,
        });
        res.json(result);
      } catch (err) {
        handleMetricsError(err, res, next);
      }
    }
  );

  // GET /dashboard — High-level KPI summary cards for #339 dashboard
  router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const definitions = await service.listDefinitions(userId);
      const values = await Promise.all(
        definitions
          .filter((d) => d.enabled)
          .map(async (def) => {
            try {
              return await service.getValue(def.id, userId);
            } catch {
              return null;
            }
          })
      );

      res.json({
        kpis: values.filter((v): v is NonNullable<typeof v> => v !== null),
        totalDefinitions: definitions.length,
        activeDefinitions: definitions.filter((d) => d.enabled).length,
      });
    } catch (err) {
      handleMetricsError(err, res, next);
    }
  });

  return router;
}
