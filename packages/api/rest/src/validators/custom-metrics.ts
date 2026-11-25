import Joi from 'joi';
import { AGGREGATIONS, WINDOWS, evaluateExpression } from '../services/metrics/metric-engine';
import { MetricInput, MetricsError } from '../types/custom-metrics';

/** Only sources backed by migrations and persisted rows are exposed. */
export const SOURCES = {
  transactions: { dimensions: ['asset', 'protocol', 'network', 'wallet', 'user'], fields: ['amount', 'id', 'status'], numeric: ['amount'] },
  oracle_prices: { dimensions: ['asset', 'protocol'], fields: ['price', 'volume_24h', 'id'], numeric: ['price', 'volume_24h'] },
  automation_executions: { dimensions: ['wallet', 'user'], fields: ['id', 'status'], numeric: [] },
} as const;
export const definitionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().max(1000).allow('').default(''),
  source: Joi.string().valid(...Object.keys(SOURCES), 'derived').required(),
  aggregation: Joi.string().valid(...AGGREGATIONS).required(),
  window: Joi.string().valid(...WINDOWS).required(),
  dimensions: Joi.array().items(Joi.string().valid('asset', 'protocol', 'network', 'wallet', 'user', 'team', 'endpoint')).unique().max(7).default([]),
  filters: Joi.object().pattern(Joi.string().valid('asset', 'protocol', 'network', 'wallet', 'user', 'status'), Joi.string().min(1).max(200)).max(6).default({}),
  field: Joi.string().max(40).required(),
  unit: Joi.string().max(40).allow('').default(''),
  enabled: Joi.boolean().default(true),
  expression: Joi.string().max(1024).optional(),
  references: Joi.object().pattern(/^[A-Za-z_][A-Za-z_0-9]{0,39}$/, Joi.string().uuid()).max(10).optional(),
  target: Joi.number().optional(),
  direction: Joi.string().valid('higher_is_better', 'lower_is_better').optional(),
}).unknown(false).and('target', 'direction');

export function validateMetric(input: unknown): MetricInput {
  const { error, value } = definitionSchema.validate(input, { abortEarly: false, convert: false });
  if (error) throw new MetricsError(400, 'INVALID_METRIC', error.message);
  const result = value as MetricInput;
  if (result.source === 'derived') {
    if (!result.expression || !result.references || Object.keys(result.references).length === 0) throw new MetricsError(400, 'INVALID_METRIC', 'Derived metrics require an expression and references');
    if (Object.keys(result.filters).length > 0) throw new MetricsError(400, 'INVALID_METRIC', 'Put filters on referenced definitions');
    try { evaluateExpression(result.expression, Object.fromEntries(Object.keys(result.references).map(key => [key, 1]))); }
    catch (error) { throw new MetricsError(400, 'INVALID_EXPRESSION', (error as Error).message); }
  } else {
    const source = SOURCES[result.source];
    const dimensions: readonly string[] = source.dimensions;
    const fields: readonly string[] = source.fields;
    const numeric: readonly string[] = source.numeric;
    if (result.expression || result.references) throw new MetricsError(400, 'INVALID_METRIC', 'References are only allowed for derived metrics');
    if (!fields.includes(result.field) || result.dimensions.some(key => !dimensions.includes(key)) || Object.keys(result.filters).some(key => !dimensions.includes(key) && !(key === 'status' && fields.includes('status')))) throw new MetricsError(400, 'UNSUPPORTED_FIELD', 'Field, filter or dimension is unavailable for this persisted source');
    if (!['count', 'rate', 'distinct_count'].includes(result.aggregation) && !numeric.includes(result.field)) throw new MetricsError(400, 'NON_NUMERIC_FIELD', 'This aggregation needs a recorded numeric field');
    if (result.source === 'transactions' && result.field === 'amount' && !['count', 'rate', 'distinct_count'].includes(result.aggregation) && !result.filters.asset && !result.dimensions.includes('asset')) throw new MetricsError(400, 'MIXED_ASSET_UNITS', 'Filter or group by asset when aggregating native transaction amounts');
    if (result.source === 'transactions' && result.field === 'amount' && result.unit.toUpperCase() === 'USD') throw new MetricsError(400, 'USD_VALUATION_UNAVAILABLE', 'Transaction amounts are native asset units; no USD valuation is recorded');
  }
  return result;
}
