/**
 * @fileoverview Persistence for compliance_reports and compliance_schedules.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import {
  ComplianceError,
  ComplianceReportRecord,
  ComplianceSchedule,
  CreateScheduleInput,
  ReportFormat,
  ReportStatus,
  ReportType,
  ScheduleCadence,
} from '../types/compliance-types';
import { computeNextRunAt } from '../services/compliance/schedule-utils';

interface ReportRow {
  id: string;
  user_id: string;
  report_type: ReportType;
  format: ReportFormat;
  status: ReportStatus;
  period_start: string;
  period_end: string;
  schedule_id: string | null;
  idempotency_key: string;
  redact_pii: boolean;
  row_count: number;
  content: string | null;
  content_type: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ScheduleRow {
  id: string;
  user_id: string;
  report_type: ReportType;
  format: ReportFormat;
  cadence: ScheduleCadence;
  redact_pii: boolean;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

const REPORTS_TABLE = 'compliance_reports';
const SCHEDULES_TABLE = 'compliance_schedules';

function rowToReport(row: ReportRow): ComplianceReportRecord {
  return {
    id: row.id,
    userId: row.user_id,
    reportType: row.report_type,
    format: row.format,
    status: row.status,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    scheduleId: row.schedule_id,
    idempotencyKey: row.idempotency_key,
    redactPii: row.redact_pii,
    rowCount: row.row_count,
    content: row.content,
    contentType: row.content_type,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

function rowToSchedule(row: ScheduleRow): ComplianceSchedule {
  return {
    id: row.id,
    userId: row.user_id,
    reportType: row.report_type,
    format: row.format,
    cadence: row.cadence,
    redactPii: row.redact_pii,
    enabled: row.enabled,
    nextRunAt: new Date(row.next_run_at),
    lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class ComplianceReportRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async findByIdempotencyKey(key: string): Promise<ComplianceReportRecord | null> {
    const { data, error } = await this.client
      .from(REPORTS_TABLE)
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return data ? rowToReport(data as ReportRow) : null;
  }

  async createPending(input: {
    userId: string;
    reportType: ReportType;
    format: ReportFormat;
    periodStart: Date;
    periodEnd: Date;
    idempotencyKey: string;
    redactPii: boolean;
    scheduleId?: string | null;
  }): Promise<ComplianceReportRecord> {
    const { data, error } = await this.client
      .from(REPORTS_TABLE)
      .insert({
        user_id: input.userId,
        report_type: input.reportType,
        format: input.format,
        status: 'pending',
        period_start: input.periodStart.toISOString(),
        period_end: input.periodEnd.toISOString(),
        schedule_id: input.scheduleId ?? null,
        idempotency_key: input.idempotencyKey,
        redact_pii: input.redactPii,
        row_count: 0,
      })
      .select('*')
      .single();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return rowToReport(data as ReportRow);
  }

  async markCompleted(
    id: string,
    userId: string,
    update: {
      content: string;
      contentType: string;
      rowCount: number;
    }
  ): Promise<ComplianceReportRecord> {
    const { data, error } = await this.client
      .from(REPORTS_TABLE)
      .update({
        status: 'completed',
        content: update.content,
        content_type: update.contentType,
        row_count: update.rowCount,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return rowToReport(data as ReportRow);
  }

  async markFailed(id: string, userId: string, message: string): Promise<void> {
    const { error } = await this.client
      .from(REPORTS_TABLE)
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
  }

  async getForUser(id: string, userId: string): Promise<ComplianceReportRecord> {
    const { data, error } = await this.client
      .from(REPORTS_TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    if (!data) {
      throw new ComplianceError('NOT_FOUND', 'Report not found', 404);
    }
    return rowToReport(data as ReportRow);
  }

  async listForUser(
    userId: string,
    opts: { reportType?: ReportType; limit: number; offset: number }
  ): Promise<ComplianceReportRecord[]> {
    let query = this.client
      .from(REPORTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1);

    if (opts.reportType) {
      query = query.eq('report_type', opts.reportType);
    }

    const { data, error } = await query;
    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return (data || []).map((row) => rowToReport(row as ReportRow));
  }

  async createSchedule(userId: string, input: CreateScheduleInput): Promise<ComplianceSchedule> {
    const nextRunAt = computeNextRunAt(input.cadence);
    const { data, error } = await this.client
      .from(SCHEDULES_TABLE)
      .insert({
        user_id: userId,
        report_type: input.reportType,
        format: input.format,
        cadence: input.cadence,
        redact_pii: input.redactPii ?? true,
        enabled: true,
        next_run_at: nextRunAt.toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return rowToSchedule(data as ScheduleRow);
  }

  async listSchedules(userId: string): Promise<ComplianceSchedule[]> {
    const { data, error } = await this.client
      .from(SCHEDULES_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return (data || []).map((row) => rowToSchedule(row as ScheduleRow));
  }

  async deleteSchedule(id: string, userId: string): Promise<void> {
    const { data, error } = await this.client
      .from(SCHEDULES_TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    if (!data) {
      throw new ComplianceError('NOT_FOUND', 'Schedule not found', 404);
    }
  }

  async listDueSchedules(now: Date = new Date(), limit = 50): Promise<ComplianceSchedule[]> {
    const { data, error } = await this.client
      .from(SCHEDULES_TABLE)
      .select('*')
      .eq('enabled', true)
      .lte('next_run_at', now.toISOString())
      .order('next_run_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
    return (data || []).map((row) => rowToSchedule(row as ScheduleRow));
  }

  async markScheduleRun(
    id: string,
    nextRunAt: Date,
    lastRunAt: Date = new Date()
  ): Promise<void> {
    const { error } = await this.client
      .from(SCHEDULES_TABLE)
      .update({
        next_run_at: nextRunAt.toISOString(),
        last_run_at: lastRunAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new ComplianceError('REPOSITORY_ERROR', error.message, 500);
    }
  }
}
