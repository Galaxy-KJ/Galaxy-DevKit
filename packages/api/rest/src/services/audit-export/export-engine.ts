/**
 * @fileoverview Audit trail export engine.
 * @description Runs as a non-blocking background job: `startExport` persists
 *              a `pending` record and returns immediately, while the actual
 *              audit-log paging, hash-chain computation, and formatting run
 *              asynchronously. Callers poll `getExport` for status/content.
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import { AuditEvent, AuditLogger } from '../audit-logger';
import { AuditExportRepository } from '../../repositories/audit-export.repository';
import {
  AuditExportError,
  AuditExportRecord,
  CreateExportInput,
  ExportedManifest,
} from '../../types/audit-export-types';
import { buildHashChain, ChainVerificationResult } from './hash-chain';
import { exportAuditTrail } from './exporters';
import { verifyExportRecord } from './verifier';

/** Hard cap on pages fetched per export (page size 200 => 200k records) to bound worst-case memory/time. */
const MAX_PAGES = 1000;

export class AuditExportEngine {
  constructor(
    private readonly auditLogger: AuditLogger = new AuditLogger(),
    private readonly repository: AuditExportRepository = new AuditExportRepository()
  ) {}

  /**
   * Creates the pending export record and kicks off background processing.
   * Returns immediately with the pending record so callers can poll status.
   */
  async startExport(userId: string, input: CreateExportInput): Promise<AuditExportRecord> {
    if (input.from.getTime() > input.to.getTime()) {
      throw new AuditExportError(
        'VALIDATION_ERROR',
        '`from` must be earlier than or equal to `to`',
        400
      );
    }

    let from = input.from;
    if (input.incremental) {
      const lastExportedAt = await this.repository.getLastExportedAt(userId);
      if (lastExportedAt && lastExportedAt.getTime() > from.getTime()) {
        from = lastExportedAt;
      }
    }

    const pending = await this.repository.createPending({
      userId,
      format: input.format,
      periodStart: from,
      periodEnd: input.to,
      filterAction: input.filters?.action ?? null,
      filterResource: input.filters?.resource ?? null,
      incremental: input.incremental ?? false,
    });

    void this.process(pending.id, userId, {
      ...input,
      from,
    });

    return pending;
  }

  private async process(exportId: string, userId: string, input: CreateExportInput): Promise<void> {
    try {
      await this.repository.markProcessing(exportId);

      const events = await this.fetchAllEvents(userId, input);
      events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const { entries, rootHash } = buildHashChain(events);

      const manifest: ExportedManifest = {
        format: input.format,
        generatedAt: new Date().toISOString(),
        period: { from: input.from.toISOString(), to: input.to.toISOString() },
        filters: input.filters ?? {},
        recordCount: entries.length,
        chainRootHash: rootHash,
      };

      const exported = exportAuditTrail(input.format, manifest, entries);

      await this.repository.markCompleted(exportId, {
        content: exported.content,
        contentType: exported.contentType,
        recordCount: entries.length,
        chainRootHash: rootHash,
      });

      await this.repository.setLastExportedAt(userId, input.to);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export generation failed';
      await this.repository.markFailed(exportId, message);
    }
  }

  private async fetchAllEvents(userId: string, input: CreateExportInput): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.auditLogger.query({
        userId,
        action: input.filters?.action,
        resource: input.filters?.resource,
        from: input.from,
        to: input.to,
        cursor,
        limit: 200,
      });

      events.push(...result.items);

      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }

    return events;
  }

  async getExport(userId: string, exportId: string): Promise<AuditExportRecord> {
    return this.repository.getForUser(exportId, userId);
  }

  async listExports(
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<AuditExportRecord[]> {
    return this.repository.listForUser(userId, {
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    });
  }

  async verifyExport(userId: string, exportId: string): Promise<ChainVerificationResult> {
    const record = await this.repository.getForUser(exportId, userId);
    return verifyExportRecord(record);
  }
}
