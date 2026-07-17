/**
 * @fileoverview Compliance report generation engine.
 * @description Aggregates audit logs into regulatory-ready reports with
 *              idempotent persistence and multi-format export.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { createHash } from 'crypto';
import { AuditEvent, AuditLogger } from '../audit-logger';
import { ComplianceReportRepository } from '../../repositories/compliance-report.repository';
import {
  ComplianceError,
  ComplianceReportRecord,
  GenerateReportInput,
  REPORT_TEMPLATES,
  ReportTemplateMeta,
} from '../../types/compliance-types';
import { buildReportPayload } from './templates';
import { redactReportRows } from './pii-redaction';
import { exportReport } from './exporters';

export function buildIdempotencyKey(input: {
  userId: string;
  reportType: string;
  format: string;
  from: Date;
  to: Date;
  redactPii: boolean;
  scheduleId?: string | null;
}): string {
  const raw = [
    input.userId,
    input.reportType,
    input.format,
    input.from.toISOString(),
    input.to.toISOString(),
    input.redactPii ? '1' : '0',
    input.scheduleId ?? 'on-demand',
  ].join('|');

  return createHash('sha256').update(raw).digest('hex');
}

export class ComplianceReportEngine {
  constructor(
    private readonly auditLogger: AuditLogger = new AuditLogger(),
    private readonly repository: ComplianceReportRepository = new ComplianceReportRepository()
  ) {}

  listTemplates(): ReportTemplateMeta[] {
    return REPORT_TEMPLATES;
  }

  /**
   * Generate (or return existing) report for the given user and input.
   * Idempotent: same parameters return the same completed report.
   */
  async generate(
    userId: string,
    input: GenerateReportInput,
    options: { scheduleId?: string | null } = {}
  ): Promise<ComplianceReportRecord> {
    if (input.from.getTime() > input.to.getTime()) {
      throw new ComplianceError(
        'VALIDATION_ERROR',
        '`from` must be earlier than or equal to `to`',
        400
      );
    }

    const redactPii = input.redactPii !== false;
    const idempotencyKey = buildIdempotencyKey({
      userId,
      reportType: input.reportType,
      format: input.format,
      from: input.from,
      to: input.to,
      redactPii,
      scheduleId: options.scheduleId ?? null,
    });

    const existing = await this.repository.findByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === 'completed') {
      return existing;
    }
    if (existing && existing.status === 'pending') {
      // Another worker may be generating; return pending record as-is.
      return existing;
    }

    const pending =
      existing ??
      (await this.repository.createPending({
        userId,
        reportType: input.reportType,
        format: input.format,
        periodStart: input.from,
        periodEnd: input.to,
        idempotencyKey,
        redactPii,
        scheduleId: options.scheduleId ?? null,
      }));

    try {
      const events = await this.auditLogger.query({
        userId,
        from: input.from,
        to: input.to,
      });

      const payload = buildReportPayload(
        input.reportType,
        events as AuditEvent[],
        { from: input.from, to: input.to },
        redactPii
      );

      if (redactPii) {
        payload.rows = redactReportRows(payload.rows);
      }

      // Freeze generatedAt for reproducibility when re-exporting from stored content
      // is not applicable; content itself is the source of truth after completion.
      const exported = exportReport(input.format, payload);

      return await this.repository.markCompleted(pending.id, userId, {
        content: exported.content,
        contentType: exported.contentType,
        rowCount: payload.rowCount,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Report generation failed';
      await this.repository.markFailed(pending.id, userId, message);
      if (err instanceof ComplianceError) throw err;
      throw new ComplianceError('GENERATION_FAILED', message, 500);
    }
  }

  async getReport(userId: string, reportId: string): Promise<ComplianceReportRecord> {
    return this.repository.getForUser(reportId, userId);
  }

  async listReports(
    userId: string,
    opts: { reportType?: GenerateReportInput['reportType']; limit?: number; offset?: number } = {}
  ): Promise<ComplianceReportRecord[]> {
    return this.repository.listForUser(userId, {
      reportType: opts.reportType,
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    });
  }
}
