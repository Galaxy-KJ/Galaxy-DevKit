/**
 * @fileoverview Joi schemas for custom metrics and KPI definition engine.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import Joi from 'joi';

export const METRIC_SOURCES = [
  'transactions',
  'wallet_events',
  'defi_positions',
  'oracle_prices',
  'automation_executions',
  'api_request_logs',
] as const;

export const METRIC_AGGREGATIONS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'p50',
  'p95',
  'p99',
  'rate',
  'distinct_count',
] as const;

export const METRIC_WINDOWS = [
  '5m',
  '1h',
  '24h',
  '7d',
  '30d',
  'day_to_date',
  'week_to_date',
  'month_to_date',
] as const;

export const METRIC_DIMENSIONS = [
  'asset',
  'protocol',
  'network',
  'wallet',
  'user',
  'team',
  'endpoint',
] as const;

export const FILTER_OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
] as const;

const filterItemSchema = Joi.object({
  field: Joi.string().trim().min(1).max(100).required(),
  operator: Joi.string().valid(...FILTER_OPERATORS).required(),
  value: Joi.alternatives().try(
    Joi.string().allow(''),
    Joi.number(),
    Joi.boolean(),
    Joi.array().items(Joi.string(), Joi.number())
  ).required(),
}).unknown(false);

export const createMetricDefinitionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().max(500).allow(null, '').optional(),
  source: Joi.string().valid(...METRIC_SOURCES).required(),
  aggregation: Joi.string().valid(...METRIC_AGGREGATIONS).required(),
  targetField: Joi.string().trim().max(100).optional(),
  window: Joi.string().valid(...METRIC_WINDOWS).required(),
  dimensions: Joi.array()
    .items(Joi.string().valid(...METRIC_DIMENSIONS))
    .unique()
    .max(5)
    .default([]),
  filters: Joi.array().items(filterItemSchema).default([]),
  unit: Joi.string().trim().max(30).default(''),
  enabled: Joi.boolean().default(true),
  formula: Joi.string().trim().max(500).optional(),
  target: Joi.number().optional(),
  direction: Joi.string().valid('higher_is_better', 'lower_is_better').optional(),
  organizationId: Joi.string().uuid().optional(),
  metadata: Joi.object().unknown(true).default({}),
}).unknown(false);

export const updateMetricDefinitionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  description: Joi.string().max(500).allow(null, ''),
  source: Joi.string().valid(...METRIC_SOURCES),
  aggregation: Joi.string().valid(...METRIC_AGGREGATIONS),
  targetField: Joi.string().trim().max(100).allow(null),
  window: Joi.string().valid(...METRIC_WINDOWS),
  dimensions: Joi.array()
    .items(Joi.string().valid(...METRIC_DIMENSIONS))
    .unique()
    .max(5),
  filters: Joi.array().items(filterItemSchema),
  unit: Joi.string().trim().max(30),
  enabled: Joi.boolean(),
  formula: Joi.string().trim().max(500).allow(null),
  target: Joi.number().allow(null),
  direction: Joi.string().valid('higher_is_better', 'lower_is_better').allow(null),
  metadata: Joi.object().unknown(true),
}).min(1).unknown(false);

export const previewMetricSchema = Joi.object({
  source: Joi.string().valid(...METRIC_SOURCES).required(),
  aggregation: Joi.string().valid(...METRIC_AGGREGATIONS).required(),
  targetField: Joi.string().trim().max(100).optional(),
  window: Joi.string().valid(...METRIC_WINDOWS).required(),
  dimensions: Joi.array()
    .items(Joi.string().valid(...METRIC_DIMENSIONS))
    .unique()
    .max(5)
    .default([]),
  filters: Joi.array().items(filterItemSchema).default([]),
  formula: Joi.string().trim().max(500).optional(),
  target: Joi.number().optional(),
  direction: Joi.string().valid('higher_is_better', 'lower_is_better').optional(),
  dimensionFilters: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
}).unknown(false);

export const metricIdParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
}).unknown(false);

export const metricValueQuerySchema = Joi.object({
  asset: Joi.string().trim().max(50).optional(),
  protocol: Joi.string().trim().max(50).optional(),
  network: Joi.string().valid('testnet', 'mainnet').optional(),
  wallet: Joi.string().trim().max(100).optional(),
  user: Joi.string().trim().max(100).optional(),
  team: Joi.string().trim().max(100).optional(),
  endpoint: Joi.string().trim().max(100).optional(),
}).unknown(true);

export const metricSeriesQuerySchema = Joi.object({
  bucket: Joi.string().valid('1m', '5m', '15m', '1h', '1d').default('1h'),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  asset: Joi.string().trim().max(50).optional(),
  protocol: Joi.string().trim().max(50).optional(),
  network: Joi.string().valid('testnet', 'mainnet').optional(),
  wallet: Joi.string().trim().max(100).optional(),
  user: Joi.string().trim().max(100).optional(),
  team: Joi.string().trim().max(100).optional(),
  endpoint: Joi.string().trim().max(100).optional(),
}).unknown(true);

export const listMetricDefinitionsQuerySchema = Joi.object({
  enabled: Joi.boolean().optional(),
  source: Joi.string().valid(...METRIC_SOURCES).optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const importMetricDefinitionsSchema = Joi.object({
  definitions: Joi.array().items(createMetricDefinitionSchema).min(1).required(),
}).unknown(false);
