import type { SupabaseClient } from '@supabase/supabase-js';
import { MetricInput, MetricsError } from '../../types/custom-metrics';
import type { Period } from './metric-engine';

export interface EvaluationBudget { remaining: number; signal: AbortSignal }
export type MetricRow = Record<string, unknown>;
const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

/** Fixed table/column mappings; values are bound through PostgREST query methods. */
export class MetricSourceReader {
  constructor(private readonly db: SupabaseClient) {}

  private query(userId: string, metric: MetricInput, period: Period, head = false) {
    const oracle = metric.source === 'oracle_prices';
    const executions = metric.source === 'automation_executions';
    const table = oracle ? 'market_data' : executions ? 'automation_execution_attempts' : 'transactions';
    const timestamp = oracle ? 'timestamp' : 'created_at';
    const columns = oracle ? 'id,symbol,source,price,volume_24h,timestamp' : executions
      ? 'id,status,created_at,automations!inner(user_id,wallet_id)'
      : 'id,user_id,wallet_id,amount,asset,network,status,metadata,created_at';
    const filterColumns: Record<string, string> = oracle ? { asset: 'symbol', protocol: 'source' }
      : executions ? { user: 'automations.user_id', wallet: 'automations.wallet_id', status: 'status' }
      : { user: 'user_id', wallet: 'wallet_id', asset: 'asset', network: 'network', status: 'status', protocol: 'metadata->>protocol' };
    let query = this.db.from(table).select(columns, { count: head ? 'exact' : undefined, head })
        .gte(timestamp, new Date(period.start).toISOString()).lt(timestamp, new Date(period.end).toISOString());
    // Service-role clients bypass RLS: ownership must also be explicit in every source query.
    if (!oracle) query = query.eq(executions ? 'automations.user_id' : 'user_id', userId);
    for (const [key, value] of Object.entries(metric.filters)) {
      const column = filterColumns[key];
      if (!column) throw new MetricsError(400, 'UNSUPPORTED_FILTER', 'Unsupported source filter');
      query = query.eq(column, value);
    }
    return query;
  }

  async estimate(userId: string, metric: MetricInput, period: Period, budget: EvaluationBudget): Promise<void> {
    const { count, error } = await this.query(userId, metric, period, true).abortSignal(budget.signal);
    if (error || count === null) throw new MetricsError(budget.signal.aborted ? 408 : 503, 'METRIC_QUERY_FAILED', 'Cannot estimate metric scan');
    budget.remaining -= count;
    if (count > MAX_ROWS || budget.remaining < 0) throw new MetricsError(422, 'METRIC_COST_LIMIT', 'Estimated scan exceeds metric row limits; narrow filters or window');
  }

  async read(userId: string, metric: MetricInput, period: Period, budget: EvaluationBudget): Promise<MetricRow[]> {
    if (metric.source === 'derived') throw new MetricsError(400, 'INVALID_SOURCE', 'Derived metrics have no source rows');
    const oracle = metric.source === 'oracle_prices';
    const executions = metric.source === 'automation_executions';
    const rows: MetricRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      if (budget.signal.aborted) throw new MetricsError(408, 'METRIC_TIMEOUT', 'Metric evaluation timed out');
      const query = this.query(userId, metric, period).order(metric.source === 'oracle_prices' ? 'timestamp' : 'created_at').order('id').range(offset, offset + PAGE_SIZE - 1);
      const { data, error } = await query.abortSignal(budget.signal);
      if (error) throw new MetricsError(budget.signal.aborted ? 408 : 503, 'METRIC_QUERY_FAILED', 'Metric source query failed');
      const page = (data ?? []) as unknown as MetricRow[];
      budget.remaining -= page.length;
      if (budget.remaining < 0 || rows.length + page.length > MAX_ROWS) throw new MetricsError(422, 'METRIC_COST_LIMIT', 'Narrow the window or filters: evaluation row limit exceeded');
      for (const row of page) {
        const automation = row.automations as Record<string, unknown> | undefined;
        const metadata = row.metadata as Record<string, unknown> | undefined;
        const numeric = (value: unknown): number | null => {
          if (value === null || value === undefined || value === '') return null;
          const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
          return Number.isFinite(parsed) ? parsed : null;
        };
        rows.push(oracle ? { ...row, asset: row.symbol, protocol: row.source, price: numeric(row.price), volume_24h: numeric(row.volume_24h) }
          : executions ? { id: row.id, status: row.status, user: automation?.user_id, wallet: automation?.wallet_id }
          : { ...row, amount: numeric(row.amount), user: row.user_id, wallet: row.wallet_id, protocol: metadata?.protocol });
      }
      if (page.length < PAGE_SIZE) return rows;
    }
  }
}
