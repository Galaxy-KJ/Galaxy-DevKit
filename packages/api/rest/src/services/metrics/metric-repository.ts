import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../utils/supabase';
import { MetricDefinition, MetricValue, MetricsError } from '../../types/custom-metrics';

function decode(row: Record<string, unknown>): MetricDefinition {
  const { user_id, metric_window, metric_references, ...rest } = row;
  delete rest.updated_at;
  const result = { ...rest, userId: user_id, window: metric_window } as unknown as MetricDefinition;
  if (result.source === 'derived') result.references = metric_references as Record<string, string>;
  if (result.expression === null) delete result.expression;
  if (result.target === null) delete result.target;
  if (result.direction === null) delete result.direction;
  return result;
}

export class MetricRepository {
  constructor(readonly db: SupabaseClient = getSupabaseClient()) {}
  async list(userId: string): Promise<MetricDefinition[]> {
    const { data, error } = await this.db.from('metric_definitions').select('*').eq('user_id', userId).order('id').limit(51);
    if (error) throw new MetricsError(503, 'METRIC_STORAGE_ERROR', 'Cannot load metric definitions');
    return (data ?? []).map(decode);
  }
  async save(userId: string, definitions: MetricDefinition[], deleteId?: string): Promise<MetricDefinition[]> {
    const { data, error } = await this.db.rpc('save_metric_definitions', { p_user_id: userId, p_definitions: definitions, p_delete_id: deleteId ?? null });
    if (error) throw new MetricsError(409, 'METRIC_WRITE_CONFLICT', 'Metric update rejected: check references, ownership and definition limits');
    return (data ?? []).map(decode);
  }
  async snapshot(userId: string, id: string, fingerprint: string, now: number): Promise<MetricValue | null> {
    const { data, error } = await this.db.from('metric_materializations').select('value').eq('user_id', userId).eq('metric_id', id).eq('fingerprint', fingerprint).gt('expires_at', new Date(now).toISOString()).maybeSingle();
    if (error) throw new MetricsError(503, 'METRIC_STORAGE_ERROR', 'Cannot load metric snapshot');
    return data?.value ?? null;
  }
  async materialize(userId: string, id: string, fingerprint: string, value: MetricValue): Promise<void> {
    const { error } = await this.db.from('metric_materializations').upsert({ user_id: userId, metric_id: id, fingerprint, value, expires_at: value.expiresAt });
    if (error) throw new MetricsError(503, 'METRIC_STORAGE_ERROR', 'Cannot persist metric snapshot');
  }
  async scheduled(after: string, limit = 50): Promise<Array<{ id: string; user_id: string }>> {
    const { data, error } = await this.db.from('metric_definitions').select('id,user_id').eq('enabled', true).gt('id', after).order('id').limit(limit);
    if (error) throw new MetricsError(503, 'METRIC_STORAGE_ERROR', 'Cannot load scheduled metrics');
    return data ?? [];
  }
}
