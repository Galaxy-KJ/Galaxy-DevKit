/**
 * @fileoverview Report exporters for JSON, CSV, and minimal PDF.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { GeneratedReportPayload, ReportFormat, ReportRow } from '../../types/compliance-types';

export interface ExportResult {
  content: string;
  contentType: string;
}

function escapeCsvCell(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportJson(payload: GeneratedReportPayload): ExportResult {
  return {
    content: JSON.stringify(payload, null, 2),
    contentType: 'application/json',
  };
}

export function exportCsv(payload: GeneratedReportPayload): ExportResult {
  const rows = payload.rows;
  if (rows.length === 0) {
    return {
      content: 'reportType,periodFrom,periodTo,rowCount\n' +
        `${payload.reportType},${payload.period.from},${payload.period.to},0\n`,
      contentType: 'text/csv',
    };
  }

  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  const lines: string[] = [columns.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvCell(row[col] ?? null)).join(','));
  }

  return {
    content: lines.join('\n') + '\n',
    contentType: 'text/csv',
  };
}

/**
 * Minimal PDF writer (text-only, no external deps). Produces a valid single-page
 * PDF with a title and tabular lines truncated for readability.
 */
export function exportPdf(payload: GeneratedReportPayload): ExportResult {
  const lines: string[] = [
    `Galaxy DevKit Compliance Report`,
    `Type: ${payload.reportType}`,
    `Period: ${payload.period.from} -> ${payload.period.to}`,
    `Generated: ${payload.generatedAt}`,
    `Rows: ${payload.rowCount}`,
    `PII redacted: ${payload.redactPii}`,
    '',
    ...Object.entries(payload.summary).map(([k, v]) => `${k}: ${String(v)}`),
    '',
    '--- rows (first 40) ---',
  ];

  const preview = payload.rows.slice(0, 40);
  for (const row of preview) {
    lines.push(formatRowLine(row));
  }
  if (payload.rows.length > 40) {
    lines.push(`... ${payload.rows.length - 40} more rows omitted`);
  }

  const contentStream = buildPdfContentStream(lines);
  const pdf = assemblePdf(contentStream);

  return {
    content: pdf,
    contentType: 'application/pdf',
  };
}

function formatRowLine(row: ReportRow): string {
  return Object.entries(row)
    .map(([k, v]) => `${k}=${v === null || v === undefined ? '' : String(v)}`)
    .join(' | ')
    .slice(0, 110);
}

function buildPdfContentStream(lines: string[]): string {
  const escaped = lines.map((line) =>
    line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  );

  const ops: string[] = ['BT', '/F1 10 Tf', '50 780 Td', '12 TL'];
  escaped.forEach((line, index) => {
    if (index === 0) {
      ops.push(`(${line}) Tj`);
    } else {
      ops.push('T*');
      ops.push(`(${line}) Tj`);
    }
  });
  ops.push('ET');
  return ops.join('\n');
}

function assemblePdf(streamBody: string): string {
  const objects: string[] = [];

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  );

  const stream = `4 0 obj\n<< /Length ${Buffer.byteLength(streamBody, 'utf8')} >>\nstream\n${streamBody}\nendstream\nendobj\n`;
  objects.push(stream);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return pdf;
}

export function exportReport(
  format: ReportFormat,
  payload: GeneratedReportPayload
): ExportResult {
  switch (format) {
    case 'json':
      return exportJson(payload);
    case 'csv':
      return exportCsv(payload);
    case 'pdf':
      return exportPdf(payload);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unsupported format: ${_exhaustive}`);
    }
  }
}
