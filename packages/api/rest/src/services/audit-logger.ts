/**
 * @fileoverview Audit Logger Service
 * @description Writes structured audit logs to Supabase
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-02-22
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { withQueryLogging } from '../utils/query-metrics';
import { buildCursorPage, decodeCursor, CursorPageResult } from '../utils/pagination';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
  id: string;
  timestamp: string; // ISO 8601
  user_id: string | null;
  /** Organization/team the actor was operating under (Issue #61 team accounts). */
  organization_id?: string | null;
  action: string;
  resource: string | null;
  /** Concrete identifier of the affected resource (wallet id, pool address, tx hash, ...). */
  resource_id?: string | null;
  ip_address: string | null;
  success: boolean;
  error_code?: string;
  /** Defaults to 'info' when not provided. */
  severity?: AuditSeverity;
  /** Groups related events across a single request/operation (e.g. x-request-id). */
  correlation_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryFilters {
  userId?: string;
  organizationId?: string;
  action?: string;
  resource?: string;
  severity?: AuditSeverity;
  correlationId?: string;
  from?: Date;
  to?: Date;
  /** Opaque cursor returned as `nextCursor` from a previous page. */
  cursor?: string;
  /** Page size, capped at 200. Defaults to 50. */
  limit?: number;
}

export interface AuditLogOptions {
  /**
   * When true, the write is awaited and a failure is rethrown to the caller
   * instead of being swallowed. Use for operations where a lost audit entry
   * must not go unnoticed. Defaults to false (fire-and-forget).
   */
  sync?: boolean;
}

const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'privatekey',
  'encrypted_private_key',
  'secret',
  'sessiontoken',
]);

function sanitizeMetadata(input?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!input) return undefined;

  const sanitizeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }

    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      for (const [key, nestedValue] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
          continue;
        }
        sanitized[key] = sanitizeValue(nestedValue);
      }
      return sanitized;
    }

    return value;
  };

  return sanitizeValue(input) as Record<string, unknown>;
}

let supabaseClient: SupabaseClient | null = null;

function initializeSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseURL || !supabaseServiceRoleKey) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
      );
    }

    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }

  return supabaseClient;
}

export class AuditLogger {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = initializeSupabaseClient();
  }

  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>, options?: AuditLogOptions): Promise<void> {
    try {
      const sanitizedMetadata = sanitizeMetadata(event.metadata);

      const { error } = await this.supabase.from('audit_logs').insert([
        {
          user_id: event.user_id,
          organization_id: event.organization_id ?? null,
          action: event.action,
          resource: event.resource,
          resource_id: event.resource_id ?? null,
          ip_address: event.ip_address,
          success: event.success,
          error_code: event.error_code,
          severity: event.severity ?? 'info',
          correlation_id: event.correlation_id ?? null,
          metadata: sanitizedMetadata,
        },
      ]);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.warn('Failed to write audit log:', error);
      if (options?.sync) {
        throw error;
      }
    }
  }

  /**
   * Cursor-paginated audit log search. Bounded to `limit` (max 200, default
   * 50) rows per call — the previous unbounded implementation could return
   * the entire table on a broad filter.
   */
  async query(filters: AuditQueryFilters): Promise<CursorPageResult<AuditEvent>> {
    try {
      const limit = Math.min(filters.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

      let query = this.supabase.from('audit_logs').select('*');

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      if (filters.resource) {
        query = query.eq('resource', filters.resource);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.correlationId) {
        query = query.eq('correlation_id', filters.correlationId);
      }

      if (filters.from) {
        query = query.gte('timestamp', filters.from.toISOString());
      }

      if (filters.to) {
        query = query.lte('timestamp', filters.to.toISOString());
      }

      if (filters.cursor) {
        const decoded = decodeCursor(filters.cursor);
        if (decoded) {
          query = query.lt('timestamp', decoded);
        }
      }

      const { data, error } = await withQueryLogging('audit-logger.query', () =>
        query.order('timestamp', { ascending: false }).limit(limit + 1)
      );

      if (error) {
        throw error;
      }

      return buildCursorPage((data || []) as AuditEvent[], limit, (row) => row.timestamp);
    } catch (error) {
      console.warn('Failed to query audit logs:', error);
      return { items: [], nextCursor: null };
    }
  }
}

export { sanitizeMetadata };
