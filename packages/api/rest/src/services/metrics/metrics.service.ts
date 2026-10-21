/**
 * @fileoverview MetricsService - Custom metrics & KPI definition engine.
 * @description Compiles metric definitions into parameterized Supabase queries,
 *              evaluates aggregations, rolling/calendar windows, dimensions,
 *              derived arithmetic expressions with cycle detection, KPI targets,
 *              caching via globalCache with window-derived TTL, and time series buckets.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { globalCache } from '@galaxy-kj/core-stellar-sdk';
import { MetricDefinitionRepository } from '../../repositories/metric-definition.repository';
import { getSupabaseClient } from '../../utils/supabase';
import {
  CreateMetricDefinitionInput,
  DimensionBreakdown,
  KpiDirection,
  MetricAggregation,
  MetricDefinition,
  MetricDimension,
  MetricExportPayload,
  MetricImportResult,
  MetricSeriesResult,
  MetricSource,
  MetricValueResult,
  MetricWindow,
  PreviewMetricInput,
  TimeSeriesBucket,
  TrendDirection,
  UpdateMetricDefinitionInput,
} from '../../types/custom-metrics-types';

export const MAX_DEFINITIONS_PER_USER = 50;
export const MAX_SCAN_HOURS_LIMIT = 24 * 60; // 60 days
export const DEFAULT_QUERY_TIMEOUT_MS = 8000;

export class MetricsError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'MetricsError';
  }
}

interface SourceTableConfig {
  table: string;
  timeColumn: string;
  defaultTargetField: string;
  dimensionColumnMap: Record<MetricDimension, string>;
}

const SOURCE_CONFIG: Record<MetricSource, SourceTableConfig> = {
  transactions: {
    table: 'transactions',
    timeColumn: 'created_at',
    defaultTargetField: 'amount',
    dimensionColumnMap: {
      asset: 'asset',
      protocol: 'metadata->>protocol',
      network: 'network',
      wallet: 'wallet_id',
      user: 'user_id',
      team: 'metadata->>organization_id',
      endpoint: 'metadata->>endpoint',
    },
  },
  wallet_events: {
    table: 'transaction_monitoring_events',
    timeColumn: 'occurred_at',
    defaultTargetField: 'amount',
    dimensionColumnMap: {
      asset: 'details->>asset',
      protocol: 'details->>protocol',
      network: 'details->>network',
      wallet: 'monitored_account_id',
      user: 'details->>user_id',
      team: 'organization_id',
      endpoint: 'details->>endpoint',
    },
  },
  defi_positions: {
    table: 'monitoring_alerts',
    timeColumn: 'last_evaluated_at',
    defaultTargetField: 'last_health_factor',
    dimensionColumnMap: {
      asset: 'metadata->>asset',
      protocol: 'protocol',
      network: 'network',
      wallet: 'account_address',
      user: 'user_id',
      team: 'team_id',
      endpoint: 'metadata->>endpoint',
    },
  },
  oracle_prices: {
    table: 'market_data',
    timeColumn: 'timestamp',
    defaultTargetField: 'price',
    dimensionColumnMap: {
      asset: 'symbol',
      protocol: 'source',
      network: 'source',
      wallet: 'source',
      user: 'source',
      team: 'source',
      endpoint: 'source',
    },
  },
  automation_executions: {
    table: 'automation_execution_attempts',
    timeColumn: 'created_at',
    defaultTargetField: 'status',
    dimensionColumnMap: {
      asset: 'automation_id',
      protocol: 'automation_id',
      network: 'automation_id',
      wallet: 'automation_id',
      user: 'automation_id',
      team: 'automation_id',
      endpoint: 'status',
    },
  },
  api_request_logs: {
    table: 'audit_logs',
    timeColumn: 'timestamp',
    defaultTargetField: 'success',
    dimensionColumnMap: {
      asset: 'resource_id',
      protocol: 'action',
      network: 'severity',
      wallet: 'resource_id',
      user: 'user_id',
      team: 'organization_id',
      endpoint: 'resource',
    },
  },
};

/**
 * Calculates window TTL in milliseconds for caching layer.
 */
export function getTtlForWindow(window: MetricWindow): number {
  switch (window) {
    case '5m': return 30 * 1000;           // 30s
    case '1h': return 2 * 60 * 1000;       // 2m
    case '24h': return 15 * 60 * 1000;     // 15m
    case '7d': return 60 * 60 * 1000;      // 1h
    case '30d': return 6 * 60 * 60 * 1000; // 6h
    case 'day_to_date': return 5 * 60 * 1000;   // 5m
    case 'week_to_date': return 30 * 60 * 1000; // 30m
    case 'month_to_date': return 60 * 60 * 1000;// 1h
    default: return 60 * 1000;
  }
}

/**
 * Calculates window start and end dates.
 */
export function calculateWindowRange(
  window: MetricWindow,
  now: Date = new Date()
): { start: Date; end: Date; durationMs: number } {
  const end = new Date(now);

  switch (window) {
    case '5m': {
      const durationMs = 5 * 60 * 1000;
      return { start: new Date(end.getTime() - durationMs), end, durationMs };
    }
    case '1h': {
      const durationMs = 60 * 60 * 1000;
      return { start: new Date(end.getTime() - durationMs), end, durationMs };
    }
    case '24h': {
      const durationMs = 24 * 60 * 60 * 1000;
      return { start: new Date(end.getTime() - durationMs), end, durationMs };
    }
    case '7d': {
      const durationMs = 7 * 24 * 60 * 60 * 1000;
      return { start: new Date(end.getTime() - durationMs), end, durationMs };
    }
    case '30d': {
      const durationMs = 30 * 24 * 60 * 60 * 1000;
      return { start: new Date(end.getTime() - durationMs), end, durationMs };
    }
    case 'day_to_date': {
      const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      return { start, end, durationMs: Math.max(1, end.getTime() - start.getTime()) };
    }
    case 'week_to_date': {
      const day = end.getUTCDay();
      // Monday = 1, Sunday = 0
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + diffToMonday));
      return { start, end, durationMs: Math.max(1, end.getTime() - start.getTime()) };
    }
    case 'month_to_date': {
      const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
      return { start, end, durationMs: Math.max(1, end.getTime() - start.getTime()) };
    }
    default:
      throw new MetricsError('INVALID_WINDOW', `Unsupported window: ${window}`);
  }
}

/**
 * Calculates previous period window for KPI delta comparison.
 */
export function calculatePreviousPeriodRange(
  currentStart: Date,
  currentEnd: Date,
  window: MetricWindow
): { start: Date; end: Date } {
  const durationMs = currentEnd.getTime() - currentStart.getTime();

  switch (window) {
    case '5m':
    case '1h':
    case '24h':
    case '7d':
    case '30d':
      return {
        start: new Date(currentStart.getTime() - durationMs),
        end: new Date(currentStart.getTime()),
      };
    case 'day_to_date': {
      const prevEnd = new Date(currentStart.getTime());
      const prevStart = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
      return { start: prevStart, end: prevEnd };
    }
    case 'week_to_date': {
      const prevEnd = new Date(currentStart.getTime());
      const prevStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: prevStart, end: prevEnd };
    }
    case 'month_to_date': {
      const year = currentStart.getUTCFullYear();
      const month = currentStart.getUTCMonth();
      const prevStart = new Date(Date.UTC(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 1));
      const prevEnd = new Date(currentStart.getTime());
      return { start: prevStart, end: prevEnd };
    }
  }
}

export class MetricsService {
  constructor(
    private readonly repo: MetricDefinitionRepository = new MetricDefinitionRepository(),
    private readonly supabase: SupabaseClient = getSupabaseClient()
  ) {}

  // ── Definition CRUD & Lifecycle ─────────────────────────────────────────────

  async createDefinition(userId: string, input: CreateMetricDefinitionInput): Promise<MetricDefinition> {
    this.validateSourceAndAggregation(input.source, input.aggregation);
    await this.assertUserCap(userId);

    // If formula is present, validate dependencies and detect cycles
    if (input.formula) {
      await this.validateFormulaAndDetectCycles(userId, input.name, input.formula);
    }

    this.assertScanCostWithinLimit(input.window);

    return this.repo.create(userId, input);
  }

  async getDefinition(id: string, userId: string, organizationId?: string): Promise<MetricDefinition> {
    const def = await this.repo.findById(id, userId, organizationId);
    if (!def) {
      throw new MetricsError('METRIC_NOT_FOUND', `Metric definition "${id}" not found`, 404);
    }
    return def;
  }

  async listDefinitions(userId: string, organizationId?: string): Promise<MetricDefinition[]> {
    return this.repo.list({ userId, organizationId });
  }

  async updateDefinition(
    id: string,
    userId: string,
    input: UpdateMetricDefinitionInput
  ): Promise<MetricDefinition> {
    const existing = await this.getDefinition(id, userId);

    if (input.source || input.aggregation) {
      this.validateSourceAndAggregation(
        input.source ?? existing.source,
        input.aggregation ?? existing.aggregation
      );
    }

    if (input.formula) {
      await this.validateFormulaAndDetectCycles(
        userId,
        input.name ?? existing.name,
        input.formula,
        id
      );
    }

    if (input.window) {
      this.assertScanCostWithinLimit(input.window);
    }

    const updated = await this.repo.update(id, userId, input);
    if (!updated) {
      throw new MetricsError('METRIC_NOT_FOUND', `Metric definition "${id}" not found`, 404);
    }

    // Invalidate cached value
    await this.invalidateMetricCache(id);

    return updated;
  }

  async deleteDefinition(id: string, userId: string): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) {
      throw new MetricsError('METRIC_NOT_FOUND', `Metric definition "${id}" not found`, 404);
    }
    await this.invalidateMetricCache(id);
  }

  // ── Metric Evaluation & KPI Calculation ─────────────────────────────────────

  async getValue(
    metricId: string,
    userId: string,
    dimensionFilters: Record<string, string> = {}
  ): Promise<MetricValueResult> {
    const definition = await this.getDefinition(metricId, userId);
    return this.evaluateDefinitionWithCaching(definition, userId, dimensionFilters);
  }

  async preview(
    input: PreviewMetricInput,
    userId: string
  ): Promise<MetricValueResult> {
    this.validateSourceAndAggregation(input.source, input.aggregation);
    this.assertScanCostWithinLimit(input.window);

    const syntheticDefinition: MetricDefinition = {
      id: 'preview',
      userId,
      name: 'Preview Metric',
      source: input.source,
      aggregation: input.aggregation,
      targetField: input.targetField ?? null,
      window: input.window,
      dimensions: input.dimensions ?? [],
      filters: input.filters ?? [],
      unit: '',
      enabled: true,
      formula: input.formula ?? null,
      target: input.target ?? null,
      direction: input.direction ?? null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.evaluateDefinition(syntheticDefinition, userId, input.dimensionFilters ?? {}, false);
  }

  async getSeries(
    metricId: string,
    userId: string,
    options: {
      bucket: string;
      from?: Date;
      to?: Date;
      dimensionFilters?: Record<string, string>;
    }
  ): Promise<MetricSeriesResult> {
    const definition = await this.getDefinition(metricId, userId);
    const to = options.to ?? new Date();
    const from = options.from ?? new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const bucketMs = this.parseBucketMs(options.bucket);
    const series: TimeSeriesBucket[] = [];

    let current = new Date(from);
    while (current.getTime() < to.getTime()) {
      const bucketEnd = new Date(Math.min(current.getTime() + bucketMs, to.getTime()));
      const value = await this.computeValueForRange(
        definition,
        userId,
        current,
        bucketEnd,
        options.dimensionFilters ?? {}
      );
      series.push({
        timestamp: current.toISOString(),
        value,
      });
      current = bucketEnd;
    }

    return {
      metricId: definition.id,
      metricName: definition.name,
      unit: definition.unit,
      bucket: options.bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      series,
    };
  }

  // ── Materialization & Backfill ──────────────────────────────────────────────

  async materialize(metricId: string, userId: string): Promise<void> {
    const definition = await this.getDefinition(metricId, userId);
    const { start, end } = calculateWindowRange(definition.window);
    const value = await this.computeValueForRange(definition, userId, start, end, {});

    await this.repo.saveMaterialization({
      metricId: definition.id,
      windowStart: start,
      windowEnd: end,
      value,
    });
  }

  async backfill(
    metricId: string,
    userId: string,
    options: { from: Date; to: Date; bucket: string }
  ): Promise<number> {
    const definition = await this.getDefinition(metricId, userId);
    const bucketMs = this.parseBucketMs(options.bucket);
    let count = 0;

    let current = new Date(options.from);
    while (current.getTime() < options.to.getTime()) {
      const bucketEnd = new Date(Math.min(current.getTime() + bucketMs, options.to.getTime()));
      const value = await this.computeValueForRange(definition, userId, current, bucketEnd, {});

      await this.repo.saveMaterialization({
        metricId: definition.id,
        windowStart: current,
        windowEnd: bucketEnd,
        value,
      });

      count++;
      current = bucketEnd;
    }

    return count;
  }

  // ── Export & Import ─────────────────────────────────────────────────────────

  async exportDefinitions(userId: string): Promise<MetricExportPayload> {
    const definitions = await this.repo.list({ userId });
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      definitions: definitions.map((d) => ({
        name: d.name,
        description: d.description,
        source: d.source,
        aggregation: d.aggregation,
        targetField: d.targetField,
        window: d.window,
        dimensions: d.dimensions,
        filters: d.filters,
        unit: d.unit,
        enabled: d.enabled,
        formula: d.formula,
        target: d.target,
        direction: d.direction,
        metadata: d.metadata,
      })),
    };
  }

  async importDefinitions(
    userId: string,
    payload: { definitions: CreateMetricDefinitionInput[] }
  ): Promise<MetricImportResult> {
    const imported: MetricDefinition[] = [];
    const errors: string[] = [];

    // Check cap upfront
    const currentCount = await this.repo.countForUser(userId);
    if (currentCount + payload.definitions.length > MAX_DEFINITIONS_PER_USER) {
      throw new MetricsError(
        'METRIC_CAP_EXCEEDED',
        `Importing ${payload.definitions.length} metrics would exceed maximum allowed limit of ${MAX_DEFINITIONS_PER_USER}`
      );
    }

    // Topological cycle validation across incoming definitions
    for (const def of payload.definitions) {
      if (def.formula) {
        await this.validateFormulaAndDetectCycles(userId, def.name, def.formula);
      }
    }

    for (const def of payload.definitions) {
      try {
        const created = await this.repo.create(userId, def);
        imported.push(created);
      } catch (err: any) {
        errors.push(`Failed to import "${def.name}": ${err.message}`);
      }
    }

    return {
      importedCount: imported.length,
      imported,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // ── Private Evaluation Helpers ──────────────────────────────────────────────

  private async evaluateDefinitionWithCaching(
    definition: MetricDefinition,
    userId: string,
    dimensionFilters: Record<string, string>
  ): Promise<MetricValueResult> {
    const cacheKey = this.buildCacheKey(definition, dimensionFilters);
    const ttlMs = getTtlForWindow(definition.window);

    // Check globalCache
    const cached = await globalCache.get<MetricValueResult>('custom-metrics', cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    const result = await this.evaluateDefinition(definition, userId, dimensionFilters, false);

    // Save to cache
    await globalCache.set('custom-metrics', cacheKey, result, { ttlMs });

    return result;
  }

  private async evaluateDefinition(
    definition: MetricDefinition,
    userId: string,
    dimensionFilters: Record<string, string>,
    cached: boolean
  ): Promise<MetricValueResult> {
    const now = new Date();
    const { start: currentStart, end: currentEnd } = calculateWindowRange(definition.window, now);
    const { start: prevStart, end: prevEnd } = calculatePreviousPeriodRange(
      currentStart,
      currentEnd,
      definition.window
    );

    const [currentValue, previousValue] = await Promise.all([
      this.computeValueForRange(definition, userId, currentStart, currentEnd, dimensionFilters),
      this.computeValueForRange(definition, userId, prevStart, prevEnd, dimensionFilters),
    ]);

    // Breakdown if dimensions specified
    let breakdown: DimensionBreakdown[] | undefined;
    if (definition.dimensions.length > 0 && !definition.formula) {
      breakdown = await this.computeBreakdown(definition, userId, currentStart, currentEnd, dimensionFilters);
    }

    // KPI Target & Trend
    const delta = previousValue !== null ? Number((currentValue - previousValue).toFixed(8)) : null;
    const deltaPct =
      previousValue !== null && previousValue !== 0
        ? Number((((currentValue - previousValue) / Math.abs(previousValue)) * 100).toFixed(2))
        : null;

    const trend = this.calculateTrend(currentValue, previousValue, definition.direction);
    const targetMet = this.calculateTargetMet(currentValue, definition.target, definition.direction);

    return {
      metricId: definition.id,
      metricName: definition.name,
      currentValue,
      unit: definition.unit,
      window: definition.window,
      windowStart: currentStart.toISOString(),
      windowEnd: currentEnd.toISOString(),
      target: definition.target ?? null,
      direction: definition.direction ?? null,
      previousValue,
      delta,
      deltaPct,
      trend,
      targetMet,
      cached,
      breakdown,
    };
  }

  private async computeValueForRange(
    definition: MetricDefinition,
    userId: string,
    start: Date,
    end: Date,
    dimensionFilters: Record<string, string>
  ): Promise<number> {
    // 1. If derived metric (formula), evaluate sub-metrics
    if (definition.formula) {
      return this.evaluateDerivedMetric(definition, userId, start, end, dimensionFilters);
    }

    // 2. Fetch records through parameterized Supabase query with timeout
    const rows = await this.executeParameterizedQuery(definition, userId, start, end, dimensionFilters);

    // 3. Aggregate values in memory
    const targetField = definition.targetField || SOURCE_CONFIG[definition.source].defaultTargetField;
    const values = this.extractNumericValues(rows, targetField);

    return this.aggregate(definition.aggregation, values, start, end);
  }

  private async computeBreakdown(
    definition: MetricDefinition,
    userId: string,
    start: Date,
    end: Date,
    dimensionFilters: Record<string, string>
  ): Promise<DimensionBreakdown[]> {
    const rows = await this.executeParameterizedQuery(definition, userId, start, end, dimensionFilters);
    const targetField = definition.targetField || SOURCE_CONFIG[definition.source].defaultTargetField;
    const config = SOURCE_CONFIG[definition.source];

    // Group rows by dimension tuple
    const groups = new Map<string, { dims: Record<string, string>; values: number[] }>();

    for (const row of rows) {
      const dimRecord: Record<string, string> = {};
      for (const dim of definition.dimensions) {
        const val = this.extractRowDimensionValue(row, dim, config);
        dimRecord[dim] = val;
      }
      const key = JSON.stringify(dimRecord);
      if (!groups.has(key)) {
        groups.set(key, { dims: dimRecord, values: [] });
      }
      const num = this.extractRowNumericValue(row, targetField);
      if (num !== null) {
        groups.get(key)!.values.push(num);
      }
    }

    const breakdown: DimensionBreakdown[] = [];
    for (const group of groups.values()) {
      const aggValue = this.aggregate(definition.aggregation, group.values, start, end);
      breakdown.push({
        dimensions: group.dims,
        value: aggValue,
      });
    }

    return breakdown;
  }

  private extractRowDimensionValue(
    row: Record<string, unknown>,
    dimension: MetricDimension,
    config: SourceTableConfig
  ): string {
    const colExpr = config.dimensionColumnMap[dimension];
    if (colExpr.includes('->>')) {
      const [col, prop] = colExpr.split('->>');
      const json = row[col];
      if (json && typeof json === 'object') {
        return String((json as Record<string, unknown>)[prop] ?? 'unknown');
      }
      return 'unknown';
    }
    return String(row[colExpr] ?? 'unknown');
  }

  private extractRowNumericValue(row: Record<string, unknown>, field: string): number | null {
    const val = row[field];
    if (typeof val === 'number') return Number.isFinite(val) ? val : null;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof val === 'boolean') return val ? 1 : 0;
    return null;
  }

  private extractNumericValues(rows: Array<Record<string, unknown>>, targetField: string): number[] {
    const values: number[] = [];
    for (const row of rows) {
      const num = this.extractRowNumericValue(row, targetField);
      if (num !== null) {
        values.push(num);
      }
    }
    return values;
  }

  /**
   * Executes parameterized Supabase query (never string-concatenated SQL) with timeout.
   */
  private async executeParameterizedQuery(
    definition: MetricDefinition,
    userId: string,
    start: Date,
    end: Date,
    dimensionFilters: Record<string, string>
  ): Promise<Array<Record<string, unknown>>> {
    const config = SOURCE_CONFIG[definition.source];

    let query = this.supabase
      .from(config.table)
      .select('*')
      .gte(config.timeColumn, start.toISOString())
      .lte(config.timeColumn, end.toISOString());

    // Apply defined filters in metric definition
    for (const filter of definition.filters) {
      switch (filter.operator) {
        case 'eq':
          query = query.eq(filter.field, filter.value);
          break;
        case 'neq':
          query = query.neq(filter.field, filter.value);
          break;
        case 'gt':
          query = query.gt(filter.field, filter.value);
          break;
        case 'gte':
          query = query.gte(filter.field, filter.value);
          break;
        case 'lt':
          query = query.lt(filter.field, filter.value);
          break;
        case 'lte':
          query = query.lte(filter.field, filter.value);
          break;
        case 'in':
          query = query.in(
            filter.field,
            Array.isArray(filter.value) ? filter.value : [filter.value]
          );
          break;
        case 'contains':
          query = query.ilike(filter.field, `%${filter.value}%`);
          break;
      }
    }

    // Apply runtime dimension filters
    for (const [dim, val] of Object.entries(dimensionFilters)) {
      if (dim in config.dimensionColumnMap) {
        const col = config.dimensionColumnMap[dim as MetricDimension];
        if (!col.includes('->>')) {
          query = query.eq(col, val);
        }
      }
    }

    // User scope: if user_id column exists on table
    if (config.table === 'transactions' || config.table === 'monitoring_alerts' || config.table === 'audit_logs') {
      query = query.eq('user_id', userId);
    }

    // Wrap query with timeout guard
    const queryPromise = query.then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    });

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new MetricsError('QUERY_TIMEOUT', 'Metric query execution timed out', 408)),
        DEFAULT_QUERY_TIMEOUT_MS
      );
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    });

    try {
      return await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Pure aggregation calculator for numeric values.
   */
  public aggregate(
    aggregation: MetricAggregation,
    values: number[],
    start: Date,
    end: Date
  ): number {
    if (aggregation === 'count') {
      return values.length;
    }

    if (values.length === 0) {
      return 0;
    }

    switch (aggregation) {
      case 'sum': {
        const sum = values.reduce((a, b) => a + b, 0);
        return Number(sum.toFixed(8));
      }
      case 'avg': {
        const sum = values.reduce((a, b) => a + b, 0);
        return Number((sum / values.length).toFixed(8));
      }
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'p50':
        return this.computePercentile(values, 0.5);
      case 'p95':
        return this.computePercentile(values, 0.95);
      case 'p99':
        return this.computePercentile(values, 0.99);
      case 'rate': {
        const durationSec = Math.max(1, (end.getTime() - start.getTime()) / 1000);
        return Number((values.length / durationSec).toFixed(6));
      }
      case 'distinct_count': {
        const set = new Set(values);
        return set.size;
      }
      default:
        throw new MetricsError('UNSUPPORTED_AGGREGATION', `Aggregation "${aggregation}" is not supported`);
    }
  }

  private computePercentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) return sorted[lower];
    return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(8));
  }

  // ── Derived Metrics & Cycle Detection ───────────────────────────────────────

  private async evaluateDerivedMetric(
    definition: MetricDefinition,
    userId: string,
    start: Date,
    end: Date,
    dimensionFilters: Record<string, string>
  ): Promise<number> {
    const formula = definition.formula!;
    const tokens = this.extractFormulaTokens(formula);
    const tokenValues: Record<string, number> = {};

    for (const token of tokens) {
      // Find sub-definition by name or ID
      let subDef = await this.repo.findByName(token, userId);
      if (!subDef) {
        subDef = await this.repo.findById(token, userId);
      }
      if (!subDef) {
        throw new MetricsError(
          'SUB_METRIC_NOT_FOUND',
          `Derived metric formula references unknown metric "${token}"`
        );
      }

      tokenValues[token] = await this.computeValueForRange(
        subDef,
        userId,
        start,
        end,
        dimensionFilters
      );
    }

    return this.evaluateArithmeticExpression(formula, tokenValues);
  }

  /**
   * Safely evaluates arithmetic expressions without eval().
   */
  public evaluateArithmeticExpression(
    expression: string,
    variables: Record<string, number>
  ): number {
    let expr = expression;
    // Replace variable identifiers with numeric values (sorted by descending length)
    const sortedKeys = Object.keys(variables).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      expr = expr.replace(regex, String(variables[key]));
    }

    // Tokenize
    const tokens = expr.match(/(\d+(\.\d+)?|[+\-*/()])/g);
    if (!tokens) return 0;

    // Simple shunting-yard / RPN evaluator
    const outputQueue: string[] = [];
    const operatorStack: string[] = [];
    const precedence: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

    for (const token of tokens) {
      if (/^\d+(\.\d+)?$/.test(token)) {
        outputQueue.push(token);
      } else if (token in precedence) {
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1] in precedence &&
          precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
        ) {
          outputQueue.push(operatorStack.pop()!);
        }
        operatorStack.push(token);
      } else if (token === '(') {
        operatorStack.push(token);
      } else if (token === ')') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
          outputQueue.push(operatorStack.pop()!);
        }
        operatorStack.pop(); // pop '('
      }
    }

    while (operatorStack.length > 0) {
      outputQueue.push(operatorStack.pop()!);
    }

    // Evaluate RPN
    const stack: number[] = [];
    for (const token of outputQueue) {
      if (/^\d+(\.\d+)?$/.test(token)) {
        stack.push(parseFloat(token));
      } else {
        const b = stack.pop() ?? 0;
        const a = stack.pop() ?? 0;
        switch (token) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          case '/':
            stack.push(b === 0 ? 0 : a / b);
            break;
        }
      }
    }

    const res = stack.pop() ?? 0;
    return Number(res.toFixed(8));
  }

  public extractFormulaTokens(formula: string): string[] {
    const rawMatches = formula.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [];
    const reserved = new Set(['min', 'max', 'abs', 'round', 'sqrt', 'log', 'avg', 'sum']);
    return [...new Set(rawMatches.filter((t) => !reserved.has(t.toLowerCase())))];
  }

  /**
   * Cycle detection using DFS on the metric dependency graph.
   */
  public async validateFormulaAndDetectCycles(
    userId: string,
    currentMetricName: string,
    formula: string,
    currentMetricId?: string
  ): Promise<void> {
    const dependencies = this.extractFormulaTokens(formula);

    // Immediate self-cycle check
    if (dependencies.includes(currentMetricName) || (currentMetricId && dependencies.includes(currentMetricId))) {
      throw new MetricsError(
        'CYCLE_DETECTED',
        `Cycle detected in derived metric definition: ${currentMetricName} -> ${currentMetricName}`
      );
    }

    // Build dependency graph
    const allUserDefs = await this.repo.list({ userId });
    const defMap = new Map<string, MetricDefinition>();
    for (const d of allUserDefs) {
      defMap.set(d.name, d);
      defMap.set(d.id, d);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      let targetDef: MetricDefinition | undefined;
      if (node === currentMetricName || node === currentMetricId) {
        // Use incoming formula dependencies
        for (const dep of dependencies) {
          if (recStack.has(dep)) {
            throw new MetricsError(
              'CYCLE_DETECTED',
              `Cycle detected in derived metric definition: ${[...path, dep].join(' -> ')}`
            );
          }
          if (!visited.has(dep)) {
            dfs(dep, path);
          }
        }
      } else {
        targetDef = defMap.get(node);
        if (targetDef?.formula) {
          const subDeps = this.extractFormulaTokens(targetDef.formula);
          for (const dep of subDeps) {
            if (recStack.has(dep) || dep === currentMetricName || dep === currentMetricId) {
              throw new MetricsError(
                'CYCLE_DETECTED',
                `Cycle detected in derived metric definition: ${[...path, dep].join(' -> ')}`
              );
            }
            if (!visited.has(dep)) {
              dfs(dep, path);
            }
          }
        }
      }

      recStack.delete(node);
      path.pop();
    };

    dfs(currentMetricName, []);
  }

  // ── Guardrails & Validation ─────────────────────────────────────────────────

  private validateSourceAndAggregation(source: string, aggregation: string): void {
    const validSources = Object.keys(SOURCE_CONFIG);
    if (!validSources.includes(source)) {
      throw new MetricsError(
        'UNSUPPORTED_SOURCE',
        `Source "${source}" is not supported. Supported sources: ${validSources.join(', ')}`
      );
    }

    const validAggs: MetricAggregation[] = [
      'count', 'sum', 'avg', 'min', 'max', 'p50', 'p95', 'p99', 'rate', 'distinct_count',
    ];
    if (!validAggs.includes(aggregation as MetricAggregation)) {
      throw new MetricsError(
        'UNSUPPORTED_AGGREGATION',
        `Aggregation "${aggregation}" is not supported. Supported aggregations: ${validAggs.join(', ')}`
      );
    }
  }

  private async assertUserCap(userId: string): Promise<void> {
    const count = await this.repo.countForUser(userId);
    if (count >= MAX_DEFINITIONS_PER_USER) {
      throw new MetricsError(
        'METRIC_CAP_EXCEEDED',
        `Per-user metric definition limit reached (max ${MAX_DEFINITIONS_PER_USER})`
      );
    }
  }

  private assertScanCostWithinLimit(window: MetricWindow): void {
    // Scan cost estimate based on window duration in hours
    let hours = 1;
    switch (window) {
      case '5m': hours = 0.1; break;
      case '1h': hours = 1; break;
      case '24h': hours = 24; break;
      case '7d': hours = 168; break;
      case '30d': hours = 720; break;
      case 'day_to_date': hours = 24; break;
      case 'week_to_date': hours = 168; break;
      case 'month_to_date': hours = 744; break;
    }

    if (hours > MAX_SCAN_HOURS_LIMIT) {
      throw new MetricsError(
        'SCAN_COST_EXCEEDED',
        `Estimated scan window of ${hours} hours exceeds limit of ${MAX_SCAN_HOURS_LIMIT} hours`
      );
    }
  }

  private calculateTrend(
    current: number,
    previous: number | null,
    direction?: KpiDirection | null
  ): TrendDirection {
    if (previous === null) return 'neutral';
    if (current === previous) return 'stable';

    if (direction === 'higher_is_better') {
      return current > previous ? 'improving' : 'degrading';
    }
    if (direction === 'lower_is_better') {
      return current < previous ? 'improving' : 'degrading';
    }
    return 'neutral';
  }

  private calculateTargetMet(
    current: number,
    target?: number | null,
    direction?: KpiDirection | null
  ): boolean | null {
    if (target === null || target === undefined) return null;
    if (direction === 'lower_is_better') {
      return current <= target;
    }
    // Default higher_is_better
    return current >= target;
  }

  private parseBucketMs(bucket: string): number {
    switch (bucket) {
      case '1m': return 60 * 1000;
      case '5m': return 5 * 60 * 1000;
      case '15m': return 15 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  }

  private buildCacheKey(definition: MetricDefinition, dimensionFilters: Record<string, string>): string {
    const dimPart = Object.keys(dimensionFilters).sort().map((k) => `${k}=${dimensionFilters[k]}`).join('&');
    return `metric:${definition.id}:${definition.window}:${dimPart || 'all'}`;
  }

  private async invalidateMetricCache(metricId: string): Promise<void> {
    await globalCache.invalidate('custom-metrics', `metric:${metricId}:*`);
  }
}
