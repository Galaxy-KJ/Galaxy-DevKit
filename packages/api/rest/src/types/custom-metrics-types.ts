/**
 * @fileoverview Type definitions for custom metrics and KPI definition engine.
 * @description Supports operator-defined custom metrics, aggregations, rolling/calendar windows,
 *              dimensions, derived metrics with cycle detection, KPI targets and trend analysis.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

export type MetricSource =
  | 'transactions'
  | 'wallet_events'
  | 'defi_positions'
  | 'oracle_prices'
  | 'automation_executions'
  | 'api_request_logs';

export type MetricAggregation =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'p50'
  | 'p95'
  | 'p99'
  | 'rate'
  | 'distinct_count';

export type RollingWindow = '5m' | '1h' | '24h' | '7d' | '30d';
export type CalendarWindow = 'day_to_date' | 'week_to_date' | 'month_to_date';
export type MetricWindow = RollingWindow | CalendarWindow;

export type MetricDimension =
  | 'asset'
  | 'protocol'
  | 'network'
  | 'wallet'
  | 'user'
  | 'team'
  | 'endpoint';

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains';

export interface MetricFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | Array<string | number>;
}

export type KpiDirection = 'higher_is_better' | 'lower_is_better';

export interface KpiTarget {
  threshold: number;
  direction: KpiDirection;
}

export type TrendDirection = 'improving' | 'degrading' | 'stable' | 'neutral';

export interface MetricDefinition {
  id: string;
  userId: string;
  organizationId?: string | null;
  name: string;
  description?: string | null;
  source: MetricSource;
  aggregation: MetricAggregation;
  targetField?: string | null;
  window: MetricWindow;
  dimensions: MetricDimension[];
  filters: MetricFilter[];
  unit: string;
  enabled: boolean;
  formula?: string | null;
  target?: number | null;
  direction?: KpiDirection | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMetricDefinitionInput {
  name: string;
  description?: string;
  source: MetricSource;
  aggregation: MetricAggregation;
  targetField?: string;
  window: MetricWindow;
  dimensions?: MetricDimension[];
  filters?: MetricFilter[];
  unit?: string;
  enabled?: boolean;
  formula?: string;
  target?: number;
  direction?: KpiDirection;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMetricDefinitionInput {
  name?: string;
  description?: string | null;
  source?: MetricSource;
  aggregation?: MetricAggregation;
  targetField?: string | null;
  window?: MetricWindow;
  dimensions?: MetricDimension[];
  filters?: MetricFilter[];
  unit?: string;
  enabled?: boolean;
  formula?: string | null;
  target?: number | null;
  direction?: KpiDirection | null;
  metadata?: Record<string, unknown>;
}

export interface DimensionBreakdown {
  dimensions: Record<string, string>;
  value: number;
}

export interface MetricValueResult {
  metricId?: string;
  metricName: string;
  currentValue: number;
  unit: string;
  window: MetricWindow;
  windowStart: string;
  windowEnd: string;
  target: number | null;
  direction: KpiDirection | null;
  previousValue: number | null;
  delta: number | null;
  deltaPct: number | null;
  trend: TrendDirection;
  targetMet: boolean | null;
  cached: boolean;
  breakdown?: DimensionBreakdown[];
}

export interface TimeSeriesBucket {
  timestamp: string;
  value: number;
  dimensions?: Record<string, string>;
}

export interface MetricSeriesResult {
  metricId: string;
  metricName: string;
  unit: string;
  bucket: string;
  from: string;
  to: string;
  series: TimeSeriesBucket[];
}

export interface PreviewMetricInput {
  source: MetricSource;
  aggregation: MetricAggregation;
  targetField?: string;
  window: MetricWindow;
  dimensions?: MetricDimension[];
  filters?: MetricFilter[];
  formula?: string;
  target?: number;
  direction?: KpiDirection;
  dimensionFilters?: Record<string, string>;
}

export interface MetricExportPayload {
  version: string;
  exportedAt: string;
  definitions: Array<Omit<MetricDefinition, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
}

export interface MetricImportResult {
  importedCount: number;
  imported: MetricDefinition[];
  errors?: string[];
}
