/** Pure, bounded aggregation and window primitives for custom metrics (#413). */
export const AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max', 'p50', 'p95', 'p99', 'rate', 'distinct_count'] as const;
export type Aggregation = typeof AGGREGATIONS[number];
export const WINDOWS = ['5m', '1h', '24h', '7d', '30d', 'day_to_date', 'week_to_date', 'month_to_date'] as const;
export type MetricWindow = typeof WINDOWS[number];
export interface Period { start: number; end: number }

/** All periods are UTC and half-open [start, end). */
export function metricPeriods(window: MetricWindow, now: number): { current: Period; previous: Period } {
  if (!WINDOWS.includes(window)) throw new Error('Unsupported metric window');
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) throw new Error('Invalid evaluation time');
  const durations: Partial<Record<MetricWindow, number>> = {
    '5m': 300_000, '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000,
  };
  const duration = durations[window];
  if (duration !== undefined) return {
    current: { start: now - duration, end: now },
    previous: { start: now - 2 * duration, end: now - duration },
  };
  const date = new Date(now);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let start: number;
  let previousStart: number;
  switch (window) {
    case 'day_to_date': start = day; previousStart = day - 86_400_000; break;
    case 'week_to_date':
      start = day - ((date.getUTCDay() + 6) % 7) * 86_400_000;
      previousStart = start - 604_800_000;
      break;
    case 'month_to_date':
      start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      previousStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
      break;
    default: throw new Error('Unsupported metric window');
  }
  // Compare equal elapsed portions, capped by the shorter previous month.
  return { current: { start, end: now }, previous: { start: previousStart, end: Math.min(start, previousStart + now - start) } };
}

/** Missing/non-numeric samples do not silently become zero. Rate is events/sec. */
export function aggregate(aggregation: Aggregation, samples: readonly unknown[], period: Period): number | null {
  if (!AGGREGATIONS.includes(aggregation)) throw new Error('Unsupported metric aggregation');
  if (!Number.isFinite(period.start) || !Number.isFinite(period.end) || period.end < period.start) throw new Error('Invalid metric period');
  if (aggregation === 'count') return samples.length;
  if (aggregation === 'rate') return period.end === period.start ? null : samples.length / ((period.end - period.start) / 1000);
  if (aggregation === 'distinct_count') {
    return new Set(samples.filter(value => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))).size;
  }
  const values = samples.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b);
  if (values.length === 0) return null;
  let result: number;
  switch (aggregation) {
    case 'sum': result = values.reduce((a, b) => a + b, 0); break;
    case 'avg': result = values.reduce((a, b) => a + b / values.length, 0); break;
    case 'min': result = values[0]; break;
    case 'max': result = values[values.length - 1]; break;
    case 'p50': case 'p95': case 'p99': {
      const fraction = { p50: 0.5, p95: 0.95, p99: 0.99 }[aggregation];
      const index = (values.length - 1) * fraction;
      const lower = Math.floor(index);
      result = values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower);
      break;
    }
    default: throw new Error('Unsupported metric aggregation');
  }
  return Number.isFinite(result) ? result : null;
}

/** Group by ordered dimension tuples, avoiding delimiter and prototype collisions. */
export function groupSamples(
  rows: readonly Record<string, unknown>[], dimensions: readonly string[], field: string,
): Array<{ dimensions: Record<string, string | number | null>; samples: unknown[] }> {
  if (dimensions.length > 7 || new Set(dimensions).size !== dimensions.length) throw new Error('Invalid metric dimensions');
  const groups = new Map<string, { dimensions: Record<string, string | number | null>; samples: unknown[] }>();
  for (const row of rows) {
    const tuple = dimensions.map(key => {
      const value = row[key];
      return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : null;
    });
    const key = JSON.stringify(tuple);
    let group = groups.get(key);
    if (!group) {
      group = { dimensions: Object.fromEntries(dimensions.map((name, index) => [name, tuple[index]])), samples: [] };
      groups.set(key, group);
    }
    group.samples.push(row[field]);
  }
  return [...groups.values()];
}

/** Reject cycles and missing references before persisting a definition graph. */
export function assertAcyclic(graph: ReadonlyMap<string, readonly string[]>): void {
  if (graph.size > 50) throw new Error('Metric definition limit exceeded');
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('Cyclic metric reference');
    if (visited.has(id)) return;
    const dependencies = graph.get(id);
    if (!dependencies) throw new Error('Unknown metric reference');
    visiting.add(id);
    for (const dependency of dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

/** Arithmetic only: no eval, property access, functions, or executable code. */
export function evaluateExpression(expression: string, values: Readonly<Record<string, number | null>>): number | null {
  if (expression.length === 0 || expression.length > 1024) throw new Error('Invalid metric expression length');
  const tokens = expression.match(/(?:\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|[()+*/-]|\s+)/g) ?? [];
  if (tokens.join('') !== expression) throw new Error('Invalid metric expression token');
  const input = tokens.filter(token => !/^\s+$/.test(token));
  if (input.length > 128) throw new Error('Metric expression is too complex');
  let position = 0;
  let depth = 0;
  const apply = (a: number | null, b: number | null, operator: string): number | null => {
    if (a === null || b === null || (operator === '/' && b === 0)) return null;
    const result = operator === '+' ? a + b : operator === '-' ? a - b : operator === '*' ? a * b : a / b;
    return Number.isFinite(result) ? result : null;
  };
  const primary = (): number | null => {
    if (++depth > 16) throw new Error('Metric expression is too deeply nested');
    const token = input[position++];
    let result: number | null;
    if (token === '(') {
      result = addition();
      if (input[position++] !== ')') throw new Error('Unbalanced metric expression');
    } else if (token === '-' || token === '+') {
      const operand = primary();
      result = operand === null ? null : token === '-' ? -operand : operand;
    } else if (token !== undefined && /^\d/.test(token)) {
      result = Number(token);
    } else if (token !== undefined && /^[A-Za-z_]/.test(token) && Object.prototype.hasOwnProperty.call(values, token)) {
      result = values[token];
    } else {
      throw new Error('Unknown metric reference or invalid expression');
    }
    depth--;
    return result === null || Number.isFinite(result) ? result : null;
  };
  const multiplication = (): number | null => {
    let result = primary();
    while (input[position] === '*' || input[position] === '/') {
      const operator = input[position++];
      result = apply(result, primary(), operator);
    }
    return result;
  };
  const addition = (): number | null => {
    let result = multiplication();
    while (input[position] === '+' || input[position] === '-') {
      const operator = input[position++];
      result = apply(result, multiplication(), operator);
    }
    return result;
  };
  const result = addition();
  if (position !== input.length) throw new Error('Invalid metric expression');
  return result;
}
