/**
 * @fileoverview REST routes for audit trail export with cryptographic integrity (Issue #338 / Roadmap #70).
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { AuditExportEngine } from '../../services/audit-export/export-engine';
import { AuditExportError, AuditExportRecord, CreateExportInput } from '../../types/audit-export-types';
import {
  createExportSchema,
  exportIdParamSchema,
  listExportsQuerySchema,
} from '../../validators/audit-export-validators';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function handleExportError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof AuditExportError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  next(err);
}

function serializeExport(record: AuditExportRecord) {
  return {
    id: record.id,
    format: record.format,
    status: record.status,
    periodStart: record.periodStart.toISOString(),
    periodEnd: record.periodEnd.toISOString(),
    filters: {
      action: record.filterAction,
      resource: record.filterResource,
    },
    incremental: record.incremental,
    recordCount: record.recordCount,
    chainRootHash: record.chainRootHash,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
  };
}

const FILE_EXTENSIONS: Record<string, string> = {
  json: 'json',
  csv: 'csv',
  archive: 'zip',
};

export function setupAuditExportRoutes(
  engine: AuditExportEngine = new AuditExportEngine()
): express.Router {
  const router = express.Router();

  router.use(authenticate(), auditRequest());

  // POST /exports — start a background export job (non-blocking)
  router.post('/', validate(createExportSchema, 'body'), async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const body = req.body as CreateExportInput;
      const record = await engine.startExport(userId, {
        format: body.format,
        from: new Date(body.from),
        to: new Date(body.to),
        filters: body.filters,
        incremental: body.incremental,
      });
      res.status(202).json({ export: serializeExport(record) });
    } catch (err) {
      handleExportError(err, res, next);
    }
  });

  // GET /exports — list user exports
  router.get('/', validate(listExportsQuerySchema, 'query'), async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const query = req.query as unknown as { limit: number; offset: number };
      const exports = await engine.listExports(userId, {
        limit: Number(query.limit),
        offset: Number(query.offset),
      });
      res.json({ exports: exports.map(serializeExport) });
    } catch (err) {
      handleExportError(err, res, next);
    }
  });

  // GET /exports/:id — status + metadata (poll target)
  router.get('/:id', validate(exportIdParamSchema, 'params'), async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const record = await engine.getExport(userId, req.params.id);
      res.json({ export: serializeExport(record) });
    } catch (err) {
      handleExportError(err, res, next);
    }
  });

  // GET /exports/:id/download — raw export body
  router.get(
    '/:id/download',
    validate(exportIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const record = await engine.getExport(userId, req.params.id);
        if (record.status !== 'completed' || !record.content || !record.contentType) {
          res.status(409).json({
            error: {
              code: 'EXPORT_NOT_READY',
              message: 'Export is not ready for download',
              details: { status: record.status },
            },
          });
          return;
        }

        const extension = FILE_EXTENSIONS[record.format];
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="audit-export-${record.id}.${extension}"`
        );

        if (record.format === 'archive') {
          res.setHeader('Content-Type', record.contentType);
          res.status(200).send(Buffer.from(record.content, 'base64'));
        } else {
          res.setHeader('Content-Type', record.contentType);
          res.status(200).send(record.content);
        }
      } catch (err) {
        handleExportError(err, res, next);
      }
    }
  );

  // POST /exports/:id/verify — validate hash chain integrity
  router.post(
    '/:id/verify',
    validate(exportIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const result = await engine.verifyExport(userId, req.params.id);
        res.json({ verification: result });
      } catch (err) {
        handleExportError(err, res, next);
      }
    }
  );

  return router;
}
