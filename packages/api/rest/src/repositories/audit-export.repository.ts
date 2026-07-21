/**
 * @fileoverview Persistence for audit_exports and the per-user last-export cursor.
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import {
  AuditExportError,
  AuditExportRecord,
  ExportFormat,
  ExportStatus,
} from '../types/audit-export-types';

interface ExportRow {
  id: string;
  user_id: string;
  format: ExportFormat;
  status: ExportStatus;
  period_start: string;
  period_end: string;
  filter_action: string | null;
  filter_resource: string | null;
  incremental: boolean;
  record_count: number;
  chain_root_hash: string | null;
  content: string | null;
  content_type: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const EXPORTS_TABLE = 'audit_exports';
const CURSORS_TABLE = 'audit_export_cursors';

function rowToExport(row: ExportRow): AuditExportRecord {
  return {
    id: row.id,
    userId: row.user_id,
    format: row.format,
    status: row.status,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    filterAction: row.filter_action,
    filterResource: row.filter_resource,
    incremental: row.incremental,
    recordCount: row.record_count,
    chainRootHash: row.chain_root_hash,
    content: row.content,
    contentType: row.content_type,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

export class AuditExportRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async createPending(input: {
    userId: string;
    format: ExportFormat;
    periodStart: Date;
    periodEnd: Date;
    filterAction?: string | null;
    filterResource?: string | null;
    incremental: boolean;
  }): Promise<AuditExportRecord> {
    const { data, error } = await this.client
      .from(EXPORTS_TABLE)
      .insert({
        user_id: input.userId,
        format: input.format,
        status: 'pending',
        period_start: input.periodStart.toISOString(),
        period_end: input.periodEnd.toISOString(),
        filter_action: input.filterAction ?? null,
        filter_resource: input.filterResource ?? null,
        incremental: input.incremental,
        record_count: 0,
      })
      .select('*')
      .single();

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
    return rowToExport(data as ExportRow);
  }

  async markProcessing(id: string): Promise<void> {
    const { error } = await this.client
      .from(EXPORTS_TABLE)
      .update({ status: 'processing' })
      .eq('id', id);

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
  }

  async markCompleted(
    id: string,
    update: { content: string; contentType: string; recordCount: number; chainRootHash: string }
  ): Promise<void> {
    const { error } = await this.client
      .from(EXPORTS_TABLE)
      .update({
        status: 'completed',
        content: update.content,
        content_type: update.contentType,
        record_count: update.recordCount,
        chain_root_hash: update.chainRootHash,
        completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', id);

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
  }

  async markFailed(id: string, message: string): Promise<void> {
    const { error } = await this.client
      .from(EXPORTS_TABLE)
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
  }

  async getForUser(id: string, userId: string): Promise<AuditExportRecord> {
    const { data, error } = await this.client
      .from(EXPORTS_TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
    if (!data) {
      throw new AuditExportError('NOT_FOUND', 'Export not found', 404);
    }
    return rowToExport(data as ExportRow);
  }

  async listForUser(
    userId: string,
    opts: { limit: number; offset: number }
  ): Promise<AuditExportRecord[]> {
    const { data, error } = await this.client
      .from(EXPORTS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1);

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
    return (data || []).map((row) => rowToExport(row as ExportRow));
  }

  async getLastExportedAt(userId: string): Promise<Date | null> {
    const { data, error } = await this.client
      .from(CURSORS_TABLE)
      .select('last_exported_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
    return data ? new Date((data as { last_exported_at: string }).last_exported_at) : null;
  }

  async setLastExportedAt(userId: string, at: Date): Promise<void> {
    const { error } = await this.client.from(CURSORS_TABLE).upsert(
      {
        user_id: userId,
        last_exported_at: at.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      throw new AuditExportError('REPOSITORY_ERROR', error.message, 500);
    }
  }
}
