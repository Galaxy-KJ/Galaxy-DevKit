/**
 * @fileoverview Exporters for hash-chained audit trail exports (JSON/CSV/signed archive).
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import { ChainedAuditEvent } from './hash-chain';
import { ExportedManifest, ExportFormat } from '../../types/audit-export-types';
import { buildZipArchive } from './zip-writer';

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

const CSV_COLUMNS = [
  'id',
  'timestamp',
  'user_id',
  'action',
  'resource',
  'ip_address',
  'success',
  'error_code',
  'previousHash',
  'hash',
] as const;

export function exportJson(manifest: ExportedManifest, entries: ChainedAuditEvent[]): ExportResult {
  return {
    content: JSON.stringify({ manifest, entries }, null, 2),
    contentType: 'application/json',
  };
}

export function exportCsv(manifest: ExportedManifest, entries: ChainedAuditEvent[]): ExportResult {
  const header = [...CSV_COLUMNS, 'metadata'].map(escapeCsvCell).join(',');
  const lines: string[] = [header];

  for (const entry of entries) {
    const row = CSV_COLUMNS.map((col) => escapeCsvCell(entry[col] as string | number | boolean | null));
    row.push(escapeCsvCell(entry.metadata ? JSON.stringify(entry.metadata) : null));
    lines.push(row.join(','));
  }

  return {
    content: lines.join('\n') + '\n',
    contentType: 'text/csv',
  };
}

/**
 * Signed archive: a ZIP containing `manifest.json` (SHA-256 chain root hash
 * and export metadata) and `entries.json` (the full hash-chained payload).
 * GPG signing is intentionally out of scope here — the manifest is the
 * verifiable integrity artifact; a signature step can wrap this archive
 * externally without changing its layout.
 */
export function exportArchive(manifest: ExportedManifest, entries: ChainedAuditEvent[]): ExportResult {
  const zip = buildZipArchive([
    { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
    { name: 'entries.json', content: JSON.stringify(entries, null, 2) },
  ]);

  return {
    content: zip.toString('base64'),
    contentType: 'application/zip',
  };
}

export function exportAuditTrail(
  format: ExportFormat,
  manifest: ExportedManifest,
  entries: ChainedAuditEvent[]
): ExportResult {
  switch (format) {
    case 'json':
      return exportJson(manifest, entries);
    case 'csv':
      return exportCsv(manifest, entries);
    case 'archive':
      return exportArchive(manifest, entries);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unsupported format: ${_exhaustive}`);
    }
  }
}
