/**
 * @fileoverview Types for compliance reporting tools (Issue #335 / Roadmap #67).
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

export type ReportType =
  | 'transaction'
  | 'defi_activity'
  | 'user_activity'
  | 'risk_exposure';

export type ReportFormat = 'json' | 'csv' | 'pdf';

export type ReportStatus = 'pending' | 'completed' | 'failed';

export type ScheduleCadence = 'daily' | 'weekly' | 'monthly';

export interface ReportPeriod {
  from: Date;
  to: Date;
}

export interface GenerateReportInput {
  reportType: ReportType;
  format: ReportFormat;
  from: Date;
  to: Date;
  redactPii?: boolean;
}

export interface ComplianceReportRecord {
  id: string;
  userId: string;
  reportType: ReportType;
  format: ReportFormat;
  status: ReportStatus;
  periodStart: Date;
  periodEnd: Date;
  scheduleId: string | null;
  idempotencyKey: string;
  redactPii: boolean;
  rowCount: number;
  content: string | null;
  contentType: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface ComplianceSchedule {
  id: string;
  userId: string;
  reportType: ReportType;
  format: ReportFormat;
  cadence: ScheduleCadence;
  redactPii: boolean;
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScheduleInput {
  reportType: ReportType;
  format: ReportFormat;
  cadence: ScheduleCadence;
  redactPii?: boolean;
}

export interface ReportTemplateMeta {
  type: ReportType;
  name: string;
  description: string;
  columns: string[];
}

export interface ReportRow {
  [key: string]: string | number | boolean | null;
}

export interface GeneratedReportPayload {
  reportType: ReportType;
  generatedAt: string;
  period: { from: string; to: string };
  redactPii: boolean;
  rowCount: number;
  rows: ReportRow[];
  summary: Record<string, string | number | boolean | null>;
}

export class ComplianceError extends Error {
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
    this.name = 'ComplianceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const REPORT_TEMPLATES: ReportTemplateMeta[] = [
  {
    type: 'transaction',
    name: 'Transaction Report',
    description:
      'On-chain transaction activity with counterparties, amounts, and timestamps derived from audit logs.',
    columns: [
      'timestamp',
      'action',
      'resource',
      'counterparty',
      'amount',
      'asset',
      'success',
      'txHash',
    ],
  },
  {
    type: 'defi_activity',
    name: 'DeFi Activity Report',
    description:
      'Lending, borrowing, liquidity provision, and swap activity from audit metadata.',
    columns: [
      'timestamp',
      'activity',
      'protocol',
      'assetIn',
      'assetOut',
      'amount',
      'success',
      'resource',
    ],
  },
  {
    type: 'user_activity',
    name: 'User Activity Report',
    description:
      'Login history, permission changes, wallet operations, and authentication events.',
    columns: [
      'timestamp',
      'action',
      'resource',
      'ipAddress',
      'success',
      'errorCode',
    ],
  },
  {
    type: 'risk_exposure',
    name: 'Risk Exposure Report',
    description:
      'Current DeFi risk signals including collateral ratios and liquidation-related audit events.',
    columns: [
      'timestamp',
      'riskType',
      'protocol',
      'account',
      'healthFactor',
      'collateralRatio',
      'severity',
      'resource',
    ],
  },
];
