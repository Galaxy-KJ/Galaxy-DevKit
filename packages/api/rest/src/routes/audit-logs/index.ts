/**
 * @fileoverview REST routes for querying structured audit logs (Issue #334).
 * @author Galaxy DevKit Team
 * @since 2026-07-22
 */

import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { AuditLogger, AuditEvent } from '../../services/audit-logger';
import { listAuditLogsQuerySchema } from '../../validators/audit-log-validators';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function serializeAuditEvent(event: AuditEvent) {
  return {
    id: event.id,
    timestamp: event.timestamp,
    actor: {
      userId: event.user_id,
      organizationId: event.organization_id ?? null,
    },
    action: event.action,
    resource: event.resource,
    resourceId: event.resource_id ?? null,
    success: event.success,
    errorCode: event.error_code ?? null,
    severity: event.severity ?? 'info',
    correlationId: event.correlation_id ?? null,
    details: event.metadata ?? null,
  };
}

export function setupAuditLogRoutes(logger: AuditLogger = new AuditLogger()): express.Router {
  const router = express.Router();

  router.use(authenticate(), auditRequest());

  // GET /audit-logs — query the caller's own audit trail with filters.
  router.get('/', validate(listAuditLogsQuerySchema, 'query'), async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const query = req.query as unknown as {
        action?: string;
        resource?: string;
        organizationId?: string;
        severity?: 'info' | 'warning' | 'critical';
        correlationId?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit: number;
      };

      const result = await logger.query({
        userId,
        action: query.action,
        resource: query.resource,
        organizationId: query.organizationId,
        severity: query.severity,
        correlationId: query.correlationId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        cursor: query.cursor,
        limit: query.limit,
      });

      res.json({
        items: result.items.map(serializeAuditEvent),
        nextCursor: result.nextCursor,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
