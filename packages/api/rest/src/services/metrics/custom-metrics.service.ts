import { createHash, randomUUID } from 'crypto';
import { globalCache } from '@galaxy-kj/core-stellar-sdk';
import { MetricDefinition, MetricGroup, MetricInput, MetricValue, MetricsError } from '../../types/custom-metrics';
import { validateMetric } from '../../validators/custom-metrics';
import { aggregate, assertAcyclic, evaluateExpression, groupSamples, metricPeriods, Period } from './metric-engine';
import { MetricRepository } from './metric-repository';
import { EvaluationBudget, MetricSourceReader } from './metric-source-reader';

type Values = Map<string, { dimensions: MetricGroup['dimensions']; value: number | null }>;
export interface MetricCache {
  getOrFetch<T>(type: 'static-data', key: string, fetch: () => Promise<T>, options: { ttlMs: number; staleWhileRevalidate: boolean }): Promise<T>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function metricId(id: string): string {
  if (!UUID.test(id)) throw new MetricsError(400, 'INVALID_ID', 'Expected a metric UUID');
  return id;
}
export class CustomMetricsService {
  constructor(
    readonly repository = new MetricRepository(),
    private readonly reader = new MetricSourceReader(repository.db),
    private readonly cache: MetricCache = globalCache,
    private readonly now: () => number = Date.now,
  ) {}
  list(userId: string): Promise<MetricDefinition[]> { return this.repository.list(userId); }
  private find(definitions: MetricDefinition[], id: string): MetricDefinition {
    const metric = definitions.find(item => item.id === id);
    if (!metric) throw new MetricsError(404, 'METRIC_NOT_FOUND', 'Metric not found');
    return metric;
  }
  async save(userId: string, input: unknown, id?: string): Promise<MetricDefinition> {
    const definitions = await this.list(userId);
    if (id) this.find(definitions, metricId(id));
    const definition: MetricDefinition = { ...validateMetric(input), id: id ?? randomUUID(), userId, revision: randomUUID() };
    const graph = [...definitions.filter(item => item.id !== definition.id), definition];
    this.validateGraph(graph);
    await this.estimate(userId, definition, graph);
    return this.find(await this.repository.save(userId, [definition]), definition.id);
  }
  async patch(userId: string, id: string, patch: unknown): Promise<MetricDefinition> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new MetricsError(400, 'INVALID_METRIC', 'Expected an object patch');
    const current = this.find(await this.list(userId), metricId(id));
    return this.save(userId, { ...this.input(current), ...patch }, id);
  }
  private async estimate(userId: string, metric: MetricDefinition, definitions: MetricDefinition[], sharedBudget?: EvaluationBudget): Promise<void> {
    const estimate = async (budget: EvaluationBudget): Promise<void> => {
      const visited = new Set<string>();
      const visit = async (item: MetricDefinition): Promise<void> => {
        if (visited.has(item.id)) return;
        visited.add(item.id);
        if (item.source === 'derived') {
          for (const id of Object.values(item.references ?? {})) await visit(this.find(definitions, id));
        } else {
          const { current, previous } = metricPeriods(item.window, this.now());
          await this.reader.estimate(userId, item, current, budget);
          await this.reader.estimate(userId, item, previous, budget);
        }
      };
      await visit(metric);
    };
    if (sharedBudget) await estimate(sharedBudget);
    else await this.bounded(estimate);
  }
  async remove(userId: string, id: string): Promise<void> {
    this.find(await this.list(userId), metricId(id));
    await this.repository.save(userId, [], id);
  }
  private validateGraph(definitions: MetricDefinition[]): void {
    try {
      assertAcyclic(new Map(definitions.map(item => [item.id, Object.values(item.references ?? {})])));
      for (const metric of definitions) for (const id of Object.values(metric.references ?? {})) {
        const dependency = this.find(definitions, id);
        if (dependency.window !== metric.window || JSON.stringify(dependency.dimensions) !== JSON.stringify(metric.dimensions)) throw new Error('References must share window and dimensions');
      }
    } catch (error) { throw new MetricsError(400, 'INVALID_METRIC_GRAPH', (error as Error).message); }
  }
  async export(userId: string): Promise<{ schemaVersion: number; definitions: unknown[] }> {
    return { schemaVersion: 1, definitions: (await this.list(userId)).map(metric => ({ id: metric.id, ...this.input(metric) })) };
  }
  async import(userId: string, payload: unknown): Promise<MetricDefinition[]> {
    const batch = payload as { schemaVersion?: number; definitions?: Array<Record<string, unknown>> };
    if (!batch || batch.schemaVersion !== 1 || !Array.isArray(batch.definitions) || batch.definitions.length > 50) throw new MetricsError(400, 'INVALID_IMPORT', 'Expected schemaVersion 1 and at most 50 definitions');
    const ids = new Map<string, string>();
    for (const item of batch.definitions) {
      if (!item || typeof item.id !== 'string' || ids.has(item.id)) throw new MetricsError(400, 'INVALID_IMPORT', 'Unique definition IDs are required');
      ids.set(metricId(item.id), randomUUID());
    }
    const definitions = batch.definitions.map(({ id, ...input }) => {
      const metric = validateMetric(input);
      if (metric.references) metric.references = Object.fromEntries(Object.entries(metric.references).map(([alias, reference]) => {
        const replacement = ids.get(reference);
        if (!replacement) throw new MetricsError(400, 'INVALID_IMPORT', 'Import must include all referenced definitions');
        return [alias, replacement];
      }));
      return { ...metric, id: ids.get(id as string)!, userId, revision: randomUUID() };
    });
    this.validateGraph([...(await this.list(userId)), ...definitions]);
    await this.bounded(async budget => {
      for (const metric of definitions) await this.estimate(userId, metric, definitions, budget);
    });
    return this.repository.save(userId, definitions);
  }
  private fingerprint(definitions: MetricDefinition[]): string {
    return createHash('sha256').update(JSON.stringify(definitions.map(item => [item.id, item.revision]).sort())).digest('hex');
  }
  private async bounded<T>(callback: (budget: EvaluationBudget) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try { return await callback({ remaining: 20_000, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  }
  private async evaluate(userId: string, metric: MetricDefinition, definitions: MetricDefinition[], period: Period, budget: EvaluationBudget, memo: Map<string, Promise<Values>>): Promise<Values> {
    if (!metric.enabled) throw new MetricsError(409, 'METRIC_DISABLED', 'A required metric is disabled');
    const memoKey = `${metric.id}:${period.start}:${period.end}`;
    const existing = memo.get(memoKey);
    if (existing) return existing;
    const computation = (async (): Promise<Values> => {
      if (metric.source !== 'derived') {
        const rows = await this.reader.read(userId, metric, period, budget);
        const groups = groupSamples(rows, metric.dimensions, metric.field);
        if (groups.length === 0 && metric.dimensions.length === 0) groups.push({ dimensions: {}, samples: [] });
        return new Map(groups.map(group => [JSON.stringify(group.dimensions), { dimensions: group.dimensions, value: aggregate(metric.aggregation, group.samples, period) }]));
      }
      const references: Array<[string, Values]> = [];
      for (const [alias, id] of Object.entries(metric.references ?? {})) references.push([alias, await this.evaluate(userId, this.find(definitions, id), definitions, period, budget, memo)]);
      const keys = new Set(references.flatMap(([, values]) => [...values.keys()]));
      return new Map([...keys].map(key => {
        const dimensions = references.find(([, values]) => values.has(key))![1].get(key)!.dimensions;
        const values = Object.fromEntries(references.map(([alias, groups]) => [alias, groups.get(key)?.value ?? null]));
        return [key, { dimensions, value: evaluateExpression(metric.expression!, values) }];
      }));
    })();
    memo.set(memoKey, computation);
    return computation;
  }
  private async compute(userId: string, metric: MetricDefinition, definitions: MetricDefinition[], now: number, budget: EvaluationBudget): Promise<MetricValue> {
    this.validateGraph(definitions);
    const periods = metricPeriods(metric.window, now);
    const memo = new Map<string, Promise<Values>>();
    const current = await this.evaluate(userId, metric, definitions, periods.current, budget, memo);
    const previous = await this.evaluate(userId, metric, definitions, periods.previous, budget, memo);
    const groups: MetricGroup[] = [...new Set([...current.keys(), ...previous.keys()])].map(key => {
      const value = current.get(key)?.value ?? null;
      const prior = previous.get(key)?.value ?? null;
      const rawDelta = value !== null && prior !== null ? value - prior : null;
      const delta = rawDelta !== null && Number.isFinite(rawDelta) ? rawDelta : null;
      return { dimensions: (current.get(key) ?? previous.get(key))!.dimensions, value, previous: prior, delta,
        trend: delta === null || !metric.direction ? 'unknown' : delta === 0 ? 'flat' : (delta > 0) === (metric.direction === 'higher_is_better') ? 'improving' : 'worsening',
        target: metric.target ?? null,
        targetMet: value === null || metric.target === undefined ? null : metric.direction === 'higher_is_better' ? value >= metric.target : value <= metric.target };
    });
    const ttl = metric.window === '5m' ? 15_000 : metric.window === '1h' ? 60_000 : 300_000;
    return { id: metric.id, evaluatedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttl).toISOString(), groups };
  }
  async value(userId: string, id: string, filters: Record<string, string> = {}, persist = false): Promise<MetricValue> {
    const definitions = await this.list(userId);
    const stored = this.find(definitions, metricId(id));
    const metric = { ...stored, ...validateMetric({ ...this.input(stored), filters: { ...stored.filters, ...filters } }) };
    const graph = definitions.map(item => item.id === id ? metric : item);
    const fingerprint = this.fingerprint(definitions);
    const now = this.now();
    const filtered = Object.keys(filters).length > 0;
    const key = `custom-metric:${userId}:${id}:${fingerprint}:${JSON.stringify(Object.entries(filters).sort())}`;
    const ttlMs = metric.window === '5m' ? 15_000 : metric.window === '1h' ? 60_000 : 300_000;
    let value = await this.cache.getOrFetch('static-data', key, async () => {
      if (!filtered && !persist) {
        const snapshot = await this.repository.snapshot(userId, id, fingerprint, now);
        if (snapshot) return snapshot;
      }
      const value = await this.bounded(budget => this.compute(userId, metric, graph, now, budget));
      return value;
    }, { ttlMs, staleWhileRevalidate: false });
    // A persisted snapshot can expire before the enclosing cache entry.
    if (Date.parse(value.expiresAt) <= now) value = await this.bounded(budget => this.compute(userId, metric, graph, now, budget));
    if (persist && !filtered) await this.repository.materialize(userId, id, fingerprint, value);
    return value;
  }
  private input(metric: MetricDefinition): MetricInput {
    const input = { ...metric } as Partial<MetricDefinition>;
    delete input.id; delete input.userId; delete input.revision;
    return input as MetricInput;
  }
  async preview(userId: string, input: unknown): Promise<MetricValue> {
    const metric: MetricDefinition = { ...validateMetric(input), id: randomUUID(), userId, revision: randomUUID() };
    const definitions = [...await this.list(userId), metric];
    return this.bounded(budget => this.compute(userId, metric, definitions, this.now(), budget));
  }
  async series(userId: string, id: string, start: number, end: number, bucket: number): Promise<Array<{ timestamp: string; groups: MetricGroup[] }>> {
    if (![start, end, bucket].every(Number.isFinite) || bucket < 60_000 || end <= start || end > this.now() || end - start > 60 * 86_400_000 || Math.ceil((end - start) / bucket) > 120) throw new MetricsError(400, 'INVALID_SERIES', 'Series needs a past range up to 60 days, bucket >= 1 minute, at most 120 buckets');
    const definitions = await this.list(userId);
    const metric = this.find(definitions, metricId(id));
    this.validateGraph(definitions);
    return this.bounded(async budget => {
      const result: Array<{ timestamp: string; groups: MetricGroup[] }> = [];
      for (let time = start; time < end; time += bucket) {
        const values = await this.evaluate(userId, metric, definitions, { start: time, end: Math.min(time + bucket, end) }, budget, new Map());
        result.push({ timestamp: new Date(time).toISOString(), groups: [...values.values()].map(group => ({ ...group, previous: null, delta: null, trend: 'unknown', target: metric.target ?? null, targetMet: group.value === null || metric.target === undefined ? null : metric.direction === 'higher_is_better' ? group.value >= metric.target : group.value <= metric.target })) });
      }
      return result;
    });
  }
}
