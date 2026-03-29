/**
 * @fileoverview Audit Logger Service
 * @description Writes structured audit logs to Supabase
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-02-22
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuditEvent {
  id: string;
  timestamp: string; // ISO 8601
  user_id: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  success: boolean;
  error_code?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryFilters {
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

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

  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const sanitizedMetadata = sanitizeMetadata(event.metadata);

      await this.supabase.from('audit_logs').insert([
        {
          user_id: event.user_id,
          action: event.action,
          resource: event.resource,
          ip_address: event.ip_address,
          success: event.success,
          error_code: event.error_code,
          metadata: sanitizedMetadata,
        },
      ]);
    } catch (error) {
      console.warn('Failed to write audit log:', error);
    }
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    try {
      let query = this.supabase.from('audit_logs').select('*');

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      if (filters.from) {
        query = query.gte('timestamp', filters.from.toISOString());
      }

      if (filters.to) {
        query = query.lte('timestamp', filters.to.toISOString());
      }

      const { data, error } = await query.order('timestamp', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as AuditEvent[];
    } catch (error) {
      console.warn('Failed to query audit logs:', error);
      return [];
    }
  }
}

export { sanitizeMetadata };
