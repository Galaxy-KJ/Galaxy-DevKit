/**
 * @fileoverview REST routes for compliance reporting (Issue #335 / Roadmap #67).
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { ComplianceReportEngine } from '../../services/compliance/report-engine';
import { ComplianceReportRepository } from '../../repositories/compliance-report.repository';
import {
  ComplianceError,
  ComplianceReportRecord,
  CreateScheduleInput,
  GenerateReportInput,
} from '../../types/compliance-types';
import {
  createScheduleSchema,
  generateReportSchema,
  listReportsQuerySchema,
  reportIdParamSchema,
  scheduleIdParamSchema,
} from '../../validators/compliance-validators';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function handleComplianceError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof ComplianceError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  next(err);
}

function serializeReport(report: ComplianceReportRecord, includeContent = false) {
  return {
    id: report.id,
    reportType: report.reportType,
    format: report.format,
    status: report.status,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    scheduleId: report.scheduleId,
    redactPii: report.redactPii,
    rowCount: report.rowCount,
    contentType: report.contentType,
    errorMessage: report.errorMessage,
    createdAt: report.createdAt.toISOString(),
    completedAt: report.completedAt ? report.completedAt.toISOString() : null,
    ...(includeContent ? { content: report.content } : {}),
  };
}

export function setupComplianceRoutes(
  engine: ComplianceReportEngine = new ComplianceReportEngine(),
  repository: ComplianceReportRepository = new ComplianceReportRepository()
): express.Router {
  const router = express.Router();

  router.use(authenticate(), auditRequest());

  // GET /templates — list available report types
  router.get('/templates', (_req, res) => {
    res.json({ templates: engine.listTemplates() });
  });

  // POST /reports — generate on-demand report (idempotent)
  router.post(
    '/reports',
    validate(generateReportSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const body = req.body as {
          reportType: GenerateReportInput['reportType'];
          format: GenerateReportInput['format'];
          from: Date;
          to: Date;
          redactPii: boolean;
        };
        const report = await engine.generate(userId, {
          reportType: body.reportType,
          format: body.format,
          from: new Date(body.from),
          to: new Date(body.to),
          redactPii: body.redactPii,
        });
        res.status(report.status === 'completed' ? 200 : 202).json({
          report: serializeReport(report, true),
        });
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  // GET /reports — list user reports
  router.get(
    '/reports',
    validate(listReportsQuerySchema, 'query'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const query = req.query as unknown as {
          reportType?: GenerateReportInput['reportType'];
          limit: number;
          offset: number;
        };
        const reports = await engine.listReports(userId, {
          reportType: query.reportType,
          limit: Number(query.limit),
          offset: Number(query.offset),
        });
        res.json({ reports: reports.map((r) => serializeReport(r, false)) });
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  // GET /reports/:id — metadata + content
  router.get(
    '/reports/:id',
    validate(reportIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const report = await engine.getReport(userId, req.params.id);
        res.json({ report: serializeReport(report, true) });
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  // GET /reports/:id/download — raw export body
  router.get(
    '/reports/:id/download',
    validate(reportIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const report = await engine.getReport(userId, req.params.id);
        if (report.status !== 'completed' || !report.content || !report.contentType) {
          res.status(409).json({
            error: {
              code: 'REPORT_NOT_READY',
              message: 'Report is not ready for download',
              details: { status: report.status },
            },
          });
          return;
        }
        res.setHeader('Content-Type', report.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="compliance-${report.reportType}-${report.id}.${report.format}"`
        );
        res.status(200).send(report.content);
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  // POST /schedules — create scheduled generation
  router.post(
    '/schedules',
    validate(createScheduleSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const body = req.body as CreateScheduleInput;
        const schedule = await repository.createSchedule(userId, {
          reportType: body.reportType,
          format: body.format,
          cadence: body.cadence,
          redactPii: body.redactPii,
        });
        res.status(201).json({
          schedule: {
            id: schedule.id,
            reportType: schedule.reportType,
            format: schedule.format,
            cadence: schedule.cadence,
            redactPii: schedule.redactPii,
            enabled: schedule.enabled,
            nextRunAt: schedule.nextRunAt.toISOString(),
            lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
            createdAt: schedule.createdAt.toISOString(),
          },
        });
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  // GET /schedules
  router.get('/schedules', async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const schedules = await repository.listSchedules(userId);
      res.json({
        schedules: schedules.map((s) => ({
          id: s.id,
          reportType: s.reportType,
          format: s.format,
          cadence: s.cadence,
          redactPii: s.redactPii,
          enabled: s.enabled,
          nextRunAt: s.nextRunAt.toISOString(),
          lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      handleComplianceError(err, res, next);
    }
  });

  // DELETE /schedules/:id
  router.delete(
    '/schedules/:id',
    validate(scheduleIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        await repository.deleteSchedule(req.params.id, userId);
        res.status(204).send();
      } catch (err) {
        handleComplianceError(err, res, next);
      }
    }
  );

  return router;
}
