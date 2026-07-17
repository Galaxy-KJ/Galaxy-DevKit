/**
 * @fileoverview Report templates that map audit log events to compliance rows.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { AuditEvent } from '../audit-logger';
import { GeneratedReportPayload, ReportRow, ReportType } from '../../types/compliance-types';

const TX_ACTION_PREFIXES = ['wallet.', 'tx.', 'transaction.', 'stellar.'];
const DEFI_ACTION_PREFIXES = ['defi.', 'swap.', 'lend.', 'borrow.', 'liquidity.', 'blend.', 'soroswap.'];
const USER_ACTION_PREFIXES = ['auth.', 'user.', 'permission.', 'api-key.', 'session.', 'team.'];
const RISK_ACTION_PREFIXES = ['monitoring.', 'risk.', 'liquidation.', 'alert.'];

function metaString(meta: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function matchesPrefix(action: string, prefixes: string[]): boolean {
  const lower = action.toLowerCase();
  return prefixes.some((p) => lower.startsWith(p) || lower.includes(`.${p.slice(0, -1)}.`));
}

function toTransactionRow(event: AuditEvent): ReportRow {
  const meta = event.metadata ?? {};
  return {
    timestamp: event.timestamp,
    action: event.action,
    resource: event.resource,
    counterparty: metaString(meta, 'counterparty', 'to', 'destination', 'recipient'),
    amount: metaString(meta, 'amount', 'amountIn', 'value'),
    asset: metaString(meta, 'asset', 'assetIn', 'code'),
    success: event.success,
    txHash: metaString(meta, 'txHash', 'transactionHash', 'hash'),
  };
}

function toDefiRow(event: AuditEvent): ReportRow {
  const meta = event.metadata ?? {};
  return {
    timestamp: event.timestamp,
    activity: event.action,
    protocol: metaString(meta, 'protocol', 'protocolId') ?? inferProtocol(event.action),
    assetIn: metaString(meta, 'assetIn', 'asset', 'collateralAsset'),
    assetOut: metaString(meta, 'assetOut', 'borrowAsset'),
    amount: metaString(meta, 'amount', 'amountIn', 'amountOut'),
    success: event.success,
    resource: event.resource,
  };
}

function toUserActivityRow(event: AuditEvent): ReportRow {
  return {
    timestamp: event.timestamp,
    action: event.action,
    resource: event.resource,
    ipAddress: event.ip_address,
    success: event.success,
    errorCode: event.error_code ?? null,
  };
}

function toRiskRow(event: AuditEvent): ReportRow {
  const meta = event.metadata ?? {};
  const health = metaString(meta, 'healthFactor', 'health_factor');
  const ratio = metaString(meta, 'collateralRatio', 'collateral_ratio', 'ltv');
  return {
    timestamp: event.timestamp,
    riskType: event.action,
    protocol: metaString(meta, 'protocol', 'protocolId') ?? 'unknown',
    account: metaString(meta, 'account', 'accountAddress', 'address') ?? event.resource,
    healthFactor: health,
    collateralRatio: ratio,
    severity: classifySeverity(health, event.success),
    resource: event.resource,
  };
}

function inferProtocol(action: string): string {
  const lower = action.toLowerCase();
  if (lower.includes('blend')) return 'blend';
  if (lower.includes('soroswap') || lower.includes('swap')) return 'soroswap';
  return 'unknown';
}

function classifySeverity(healthFactor: string | null, success: boolean): string {
  if (!success) return 'high';
  if (!healthFactor) return 'info';
  const n = Number(healthFactor);
  if (!Number.isFinite(n)) return 'info';
  if (n < 1) return 'critical';
  if (n < 1.2) return 'high';
  if (n < 1.5) return 'medium';
  return 'low';
}

function filterEvents(events: AuditEvent[], type: ReportType): AuditEvent[] {
  switch (type) {
    case 'transaction':
      return events.filter(
        (e) =>
          matchesPrefix(e.action, TX_ACTION_PREFIXES) ||
          Boolean(e.metadata && (e.metadata.txHash || e.metadata.transactionHash || e.metadata.amount))
      );
    case 'defi_activity':
      return events.filter((e) => matchesPrefix(e.action, DEFI_ACTION_PREFIXES));
    case 'user_activity':
      return events.filter((e) => matchesPrefix(e.action, USER_ACTION_PREFIXES));
    case 'risk_exposure':
      return events.filter(
        (e) =>
          matchesPrefix(e.action, RISK_ACTION_PREFIXES) ||
          Boolean(
            e.metadata &&
              (e.metadata.healthFactor !== undefined ||
                e.metadata.health_factor !== undefined ||
                e.metadata.collateralRatio !== undefined)
          )
      );
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown report type: ${_exhaustive}`);
    }
  }
}

function mapRows(events: AuditEvent[], type: ReportType): ReportRow[] {
  switch (type) {
    case 'transaction':
      return events.map(toTransactionRow);
    case 'defi_activity':
      return events.map(toDefiRow);
    case 'user_activity':
      return events.map(toUserActivityRow);
    case 'risk_exposure':
      return events.map(toRiskRow);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown report type: ${_exhaustive}`);
    }
  }
}

function buildSummary(type: ReportType, rows: ReportRow[], allEvents: number): Record<string, string | number | boolean | null> {
  const successCount = rows.filter((r) => r.success === true).length;
  const failCount = rows.filter((r) => r.success === false).length;

  const base = {
    sourceEventsScanned: allEvents,
    matchedRows: rows.length,
    successCount,
    failCount,
  };

  if (type === 'risk_exposure') {
    const critical = rows.filter((r) => r.severity === 'critical').length;
    const high = rows.filter((r) => r.severity === 'high').length;
    return { ...base, criticalCount: critical, highCount: high };
  }

  return base;
}

/**
 * Build a deterministic, reproducible report payload from audit events.
 */
export function buildReportPayload(
  type: ReportType,
  events: AuditEvent[],
  period: { from: Date; to: Date },
  redactPii: boolean
): GeneratedReportPayload {
  const filtered = filterEvents(events, type);
  const rows = mapRows(filtered, type);

  return {
    reportType: type,
    generatedAt: new Date().toISOString(),
    period: {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
    },
    redactPii,
    rowCount: rows.length,
    rows,
    summary: buildSummary(type, rows, events.length),
  };
}
