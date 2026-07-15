/**
 * @fileoverview Routes for monitoring alerts (Issue #306 / Roadmap #53).
 * @description CRUD + event history for user-configured real-time position
 *              monitoring alerts (e.g. Blend health-factor watch).
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { MonitoringAlertService } from '../../services/monitoring/monitoring-alert.service';
import { MonitoringError } from '../../types/monitoring-types';
import {
  alertIdParamSchema,
  createAlertSchema,
  listAlertsQuerySchema,
  updateAlertSchema,
} from '../../validators/monitoring-validators';
import { globalCache } from '@galaxy-kj/core-stellar-sdk';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function handleMonitoringError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof MonitoringError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  next(err);
}

export function setupMonitoringRoutes(service: MonitoringAlertService = new MonitoringAlertService()): express.Router {
  const router = express.Router();

  // GET /monitoring/cache/stats - Retrieve hit/miss metrics of all caching channels
  router.get('/cache/stats', authenticate(), auditRequest(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await globalCache.getStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  // POST /monitoring/cache/clear - Force clear all caches (authenticated and audited)
  router.post('/cache/clear', authenticate(), auditRequest(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      await globalCache.clear();
      res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (err) {
      next(err);
    }
  });

  router.use('/alerts', authenticate(), auditRequest());

  // POST /alerts — configure a new alert
  router.post(
    '/alerts',
    validate(createAlertSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const alert = await service.create(userId, req.body);
        res.status(201).json({ alert });
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  // GET /alerts — list current user's alerts
  router.get(
    '/alerts',
    validate(listAlertsQuerySchema, 'query'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const alerts = await service.list({
          userId,
          status: req.query.status as 'active' | 'paused' | 'archived' | undefined,
          protocol: req.query.protocol as string | undefined,
          limit: Number(req.query.limit),
          offset: Number(req.query.offset),
        });
        res.json({ alerts });
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  // GET /alerts/:id — fetch one
  router.get(
    '/alerts/:id',
    validate(alertIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const alert = await service.getForUser(req.params.id, userId);
        res.json({ alert });
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  // PATCH /alerts/:id — partial update
  router.patch(
    '/alerts/:id',
    validate(alertIdParamSchema, 'params'),
    validate(updateAlertSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const alert = await service.update(req.params.id, userId, req.body);
        res.json({ alert });
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  // DELETE /alerts/:id
  router.delete(
    '/alerts/:id',
    validate(alertIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        await service.delete(req.params.id, userId);
        res.status(204).send();
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  // GET /alerts/:id/events — delivery history
  router.get(
    '/alerts/:id/events',
    validate(alertIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;
        const events = await service.listEventsForUser(req.params.id, userId, { limit, offset });
        res.json({ events });
      } catch (err) {
        handleMonitoringError(err, res, next);
      }
    }
  );

  return router;
}
