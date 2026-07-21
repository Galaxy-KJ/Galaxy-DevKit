/**
 * @fileoverview Integrity verification for completed audit exports.
 * @description Recomputes the hash chain over the entries stored in an
 *              export's content and compares it against the export's
 *              chain root hash, detecting any tampering (edits, deletions,
 *              insertions, or reordering).
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import { AuditExportError, AuditExportRecord } from '../../types/audit-export-types';
import { ChainedAuditEvent, ChainVerificationResult, verifyHashChain } from './hash-chain';
import { readZipArchive } from './zip-writer';

function parseEntries(record: AuditExportRecord): ChainedAuditEvent[] {
  if (!record.content) {
    throw new AuditExportError('EXPORT_NOT_READY', 'Export has no content to verify', 409);
  }

  switch (record.format) {
    case 'json': {
      const parsed = JSON.parse(record.content) as { entries: ChainedAuditEvent[] };
      return parsed.entries;
    }
    case 'archive': {
      const zip = Buffer.from(record.content, 'base64');
      const entriesFile = readZipArchive(zip).find((e) => e.name === 'entries.json');
      if (!entriesFile) {
        throw new AuditExportError('CORRUPT_ARCHIVE', 'entries.json missing from archive', 422);
      }
      return JSON.parse(entriesFile.content.toString('utf8')) as ChainedAuditEvent[];
    }
    default:
      throw new AuditExportError(
        'UNSUPPORTED_FORMAT',
        `Verification is not supported for the '${record.format}' format; use json or archive`,
        400
      );
  }
}

export function verifyExportRecord(record: AuditExportRecord): ChainVerificationResult {
  if (record.status !== 'completed' || !record.chainRootHash) {
    throw new AuditExportError('EXPORT_NOT_READY', 'Export is not completed', 409);
  }

  const entries = parseEntries(record);
  return verifyHashChain(entries, record.chainRootHash);
}
