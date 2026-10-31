/**
 * @fileoverview Persistence repository for custom metric definitions and materializations.
 * @description Scoped by userId and optionally organizationId.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import { withQueryLogging } from '../utils/query-metrics';
import {
  CreateMetricDefinitionInput,
  KpiDirection,
  MetricAggregation,
  MetricDefinition,
  MetricDimension,
  MetricFilter,
  MetricSource,
  MetricWindow,
  UpdateMetricDefinitionInput,
} from '../types/custom-metrics-types';

interface MetricDefinitionRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  source: MetricSource;
  aggregation: MetricAggregation;
  target_field: string | null;
  window: MetricWindow;
  dimensions: MetricDimension[];
  filters: MetricFilter[];
  unit: string;
  enabled: boolean;
  formula: string | null;
  target: number | string | null;
  direction: KpiDirection | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MetricMaterializationRow {
  id: string;
  metric_id: string;
  window_start: string;
  window_end: string;
  value: number | string;
  dimensions: Record<string, string>;
  computed_at: string;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowToDefinition(row: MetricDefinitionRow): MetricDefinition {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    source: row.source,
    aggregation: row.aggregation,
    targetField: row.target_field,
    window: row.window,
    dimensions: Array.isArray(row.dimensions) ? row.dimensions : [],
    filters: Array.isArray(row.filters) ? row.filters : [],
    unit: row.unit ?? '',
    enabled: Boolean(row.enabled),
    formula: row.formula,
    target: toNumber(row.target),
    direction: row.direction,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const DEFINITIONS_TABLE = 'metric_definitions';
const MATERIALIZATIONS_TABLE = 'metric_materializations';

export interface ListDefinitionsFilter {
  userId: string;
  organizationId?: string;
  enabled?: boolean;
  source?: MetricSource;
  limit?: number;
  offset?: number;
}

export class MetricDefinitionRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async create(userId: string, input: CreateMetricDefinitionInput): Promise<MetricDefinition> {
    const { data, error } = await this.client
      .from(DEFINITIONS_TABLE)
      .insert({
        user_id: userId,
        organization_id: input.organizationId ?? null,
        name: input.name,
        description: input.description ?? null,
        source: input.source,
        aggregation: input.aggregation,
        target_field: input.targetField ?? null,
        window: input.window,
        dimensions: input.dimensions ?? [],
        filters: input.filters ?? [],
        unit: input.unit ?? '',
        enabled: input.enabled ?? true,
        formula: input.formula ?? null,
        target: input.target ?? null,
        direction: input.direction ?? null,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create metric definition: ${error?.message ?? 'unknown error'}`);
    }

    return rowToDefinition(data as MetricDefinitionRow);
  }

  async findById(id: string, userId: string, organizationId?: string): Promise<MetricDefinition | null> {
    let query = this.client
      .from(DEFINITIONS_TABLE)
      .select('*')
      .eq('id', id);

    if (organizationId) {
      query = query.or(`user_id.eq.${userId},organization_id.eq.${organizationId}`);
    } else {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? rowToDefinition(data as MetricDefinitionRow) : null;
  }

  async findByName(name: string, userId: string): Promise<MetricDefinition | null> {
    const { data, error } = await this.client
      .from(DEFINITIONS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('name', name)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToDefinition(data as MetricDefinitionRow) : null;
  }

  async list(filter: ListDefinitionsFilter): Promise<MetricDefinition[]> {
    let query = this.client.from(DEFINITIONS_TABLE).select('*');

    if (filter.organizationId) {
      query = query.or(`user_id.eq.${filter.userId},organization_id.eq.${filter.organizationId}`);
    } else {
      query = query.eq('user_id', filter.userId);
    }

    if (filter.enabled !== undefined) {
      query = query.eq('enabled', filter.enabled);
    }
    if (filter.source) {
      query = query.eq('source', filter.source);
    }

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const { data, error } = await withQueryLogging('metric_definitions.list', () =>
      query.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
    );

    if (error) throw error;
    return (data ?? []).map((row) => rowToDefinition(row as MetricDefinitionRow));
  }

  async countForUser(userId: string): Promise<number> {
    const { count, error } = await this.client
      .from(DEFINITIONS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw error;
    return count ?? 0;
  }

  async update(
    id: string,
    userId: string,
    input: UpdateMetricDefinitionInput
  ): Promise<MetricDefinition | null> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.source !== undefined) patch.source = input.source;
    if (input.aggregation !== undefined) patch.aggregation = input.aggregation;
    if (input.targetField !== undefined) patch.target_field = input.targetField;
    if (input.window !== undefined) patch.window = input.window;
    if (input.dimensions !== undefined) patch.dimensions = input.dimensions;
    if (input.filters !== undefined) patch.filters = input.filters;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.formula !== undefined) patch.formula = input.formula;
    if (input.target !== undefined) patch.target = input.target;
    if (input.direction !== undefined) patch.direction = input.direction;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) {
      return this.findById(id, userId);
    }

    const { data, error } = await this.client
      .from(DEFINITIONS_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data ? rowToDefinition(data as MetricDefinitionRow) : null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const { error, count } = await this.client
      .from(DEFINITIONS_TABLE)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async saveMaterialization(entry: {
    metricId: string;
    windowStart: Date;
    windowEnd: Date;
    value: number;
    dimensions?: Record<string, string>;
  }): Promise<void> {
    const { error } = await this.client
      .from(MATERIALIZATIONS_TABLE)
      .insert({
        metric_id: entry.metricId,
        window_start: entry.windowStart.toISOString(),
        window_end: entry.windowEnd.toISOString(),
        value: entry.value,
        dimensions: entry.dimensions ?? {},
      });

    if (error) throw error;
  }

  async getLatestMaterialization(metricId: string): Promise<{
    value: number;
    windowStart: Date;
    windowEnd: Date;
    computedAt: Date;
  } | null> {
    const { data, error } = await this.client
      .from(MATERIALIZATIONS_TABLE)
      .select('*')
      .eq('metric_id', metricId)
      .order('window_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as MetricMaterializationRow;
    return {
      value: toNumber(row.value) ?? 0,
      windowStart: new Date(row.window_start),
      windowEnd: new Date(row.window_end),
      computedAt: new Date(row.computed_at),
    };
  }
}
