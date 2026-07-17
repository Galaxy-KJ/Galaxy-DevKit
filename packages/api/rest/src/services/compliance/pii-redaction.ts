/**
 * @fileoverview PII redaction helpers for compliance report rows.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { ReportRow } from '../../types/compliance-types';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

function redactEmail(value: string): string {
  return value.replace(EMAIL_RE, (match) => {
    const [local, domain] = match.split('@');
    if (!domain) return '[REDACTED_EMAIL]';
    const safeLocal = local.length <= 1 ? '*' : `${local[0]}***`;
    return `${safeLocal}@${domain}`;
  });
}

function redactIp(value: string): string {
  return value.replace(IP_RE, (ip) => {
    const parts = ip.split('.');
    if (parts.length !== 4) return '[REDACTED_IP]';
    return `${parts[0]}.${parts[1]}.*.*`;
  });
}

function redactString(value: string): string {
  return redactIp(redactEmail(value));
}

/**
 * Redact PII-like values in a report row. Keys known to hold IPs/emails are
 * always scrubbed; free-text fields are pattern-scanned.
 */
export function redactReportRow(row: ReportRow): ReportRow {
  const out: ReportRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    if (typeof value !== 'string') {
      out[key] = value;
      continue;
    }

    const lower = key.toLowerCase();
    if (lower.includes('ip')) {
      out[key] = redactIp(value);
      continue;
    }
    if (lower.includes('email')) {
      out[key] = redactEmail(value);
      continue;
    }
    out[key] = redactString(value);
  }
  return out;
}

export function redactReportRows(rows: ReportRow[]): ReportRow[] {
  return rows.map(redactReportRow);
}
