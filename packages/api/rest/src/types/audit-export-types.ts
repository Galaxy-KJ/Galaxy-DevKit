/**
 * @fileoverview Types for audit trail export with cryptographic integrity (Issue #338 / Roadmap #70).
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

export type ExportFormat = 'json' | 'csv' | 'archive';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ExportFilters {
  action?: string;
  resource?: string;
}

export interface CreateExportInput {
  format: ExportFormat;
  from: Date;
  to: Date;
  filters?: ExportFilters;
  /** When true, `from` is widened to the user's last completed export (if more recent). */
  incremental?: boolean;
}

export interface AuditExportRecord {
  id: string;
  userId: string;
  format: ExportFormat;
  status: ExportStatus;
  periodStart: Date;
  periodEnd: Date;
  filterAction: string | null;
  filterResource: string | null;
  incremental: boolean;
  recordCount: number;
  chainRootHash: string | null;
  content: string | null;
  contentType: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ExportedManifest {
  format: ExportFormat;
  generatedAt: string;
  period: { from: string; to: string };
  filters: ExportFilters;
  recordCount: number;
  chainRootHash: string;
}

export class AuditExportError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'AuditExportError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
