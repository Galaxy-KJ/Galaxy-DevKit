/**
 * @fileoverview Joi schemas for monitoring alert routes (extended for issue #341)
 * @description Adds validation for price/system/activity alert types,
 *              WebSocket channel config, deduplication, rate limiting, templates.
 * @author Galaxy DevKit Team
 * @since 2026-06-29 (extended 2026-07-01)
 */

import Joi from 'joi';
import { assertNotLiteralPrivateUrl, SsrfBlockedError } from '../utils/ssrf-guard';

const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;

const ALLOWED_WEBHOOK_SCHEMES =
  process.env.NODE_ENV === 'production' ? ['https'] : ['https', 'http'];

/**
 * Joi custom rule that rejects literal IPs and loopback hostnames immediately
 * so users receive an informative validation error rather than a send-time
 * failure. Dynamic DNS-to-private-range rebinding is caught at send time by
 * WebhookChannel.
 */
const webhookUrlSchema = Joi.string()
  .uri({ scheme: ALLOWED_WEBHOOK_SCHEMES })
  .custom((value: string, helpers) => {
    try {
      assertNotLiteralPrivateUrl(value);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return helpers.error('string.webhookSsrf', { message: err.message });
      }
      throw err;
    }
    return value;
  })
  .messages({
    'string.webhookSsrf': '{{#message}}',
  });

// ── Channel config schemas ────────────────────────────────────────────────────

const webhookConfigSchema = Joi.object({
  url: webhookUrlSchema.required(),
  secret: Joi.string().min(16).required(),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
}).unknown(false);

const emailConfigSchema = Joi.object({
  to: Joi.string().email().required(),
  subject: Joi.string().max(200).optional(),
}).unknown(false);

const websocketConfigSchema = Joi.object({
  topic: Joi.string().trim().min(1).max(200).required(),
}).unknown(false);

const channelConfigSchema = Joi.alternatives().conditional(Joi.ref('/channel'), {
  switch: [
    { is: 'webhook',   then: webhookConfigSchema },
    { is: 'email',     then: emailConfigSchema },
    { is: 'websocket', then: websocketConfigSchema },
  ],
  otherwise: Joi.object(),
});

// ── Sub-schemas for dedup / rate limit / template ─────────────────────────────

const deduplicationSchema = Joi.object({
  windowSeconds: Joi.number().integer().min(1).max(86_400).required(),
  fingerprintFields: Joi.array()
    .items(
      Joi.string().valid(
        'alertId', 'alertType', 'observedValue', 'threshold',
        'protocol', 'accountAddress', 'windowBucket'
      )
    )
    .min(1)
    .optional(),
}).unknown(false);

const rateLimitSchema = Joi.object({
  maxDeliveries: Joi.number().integer().min(1).required(),
  windowSeconds: Joi.number().integer().min(1).max(86_400).required(),
}).unknown(false);

const templateSchema = Joi.object({
  titleTemplate: Joi.string().min(1).max(200).required(),
  bodyTemplate: Joi.string().min(1).max(2_000).required(),
}).unknown(false);

// ── Alert type enum ───────────────────────────────────────────────────────────

const ALL_ALERT_TYPES = [
  'custom_metric_above', 'custom_metric_below',
  // Position
  'health_factor_below',
  // Price
  'price_above',
  'price_below',
  'price_change_pct',
  // System
  'api_error_rate_above',
  'oracle_staleness_above',
  'horizon_latency_above',
  // Activity
  'transaction_amount_above',
  'unusual_transaction_pattern',
] as const;

// ── Route schemas ─────────────────────────────────────────────────────────────

export const createAlertSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  protocol: Joi.when('alertType', { is: Joi.valid('custom_metric_above', 'custom_metric_below'), then: Joi.string().valid('custom').default('custom'), otherwise: Joi.string().lowercase().valid('blend', 'soroswap', 'sdex').required() }),
  accountAddress: Joi.when('alertType', { is: Joi.valid('custom_metric_above', 'custom_metric_below'), then: Joi.string().valid('').default(''), otherwise: Joi.string().pattern(STELLAR_ACCOUNT_REGEX).required() }),
  customMetricId: Joi.when('alertType', { is: Joi.valid('custom_metric_above', 'custom_metric_below'), then: Joi.string().uuid().required(), otherwise: Joi.forbidden() }),
  network: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  alertType: Joi.string().valid(...ALL_ALERT_TYPES).required(),
  threshold: Joi.number().required(),
  channel: Joi.string().valid('webhook', 'email', 'websocket').required(),
  channelConfig: channelConfigSchema.required(),
  cooldownSeconds: Joi.number().integer().min(30).max(86_400).default(300),
  deduplication: deduplicationSchema.optional(),
  rateLimit: rateLimitSchema.optional(),
  template: templateSchema.optional(),
  teamId: Joi.string().uuid().optional(),
  metadata: Joi.object().unknown(true).default({}),
}).unknown(false);

export const updateAlertSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  threshold: Joi.number(),
  channelConfig: Joi.alternatives().try(
    webhookConfigSchema,
    emailConfigSchema,
    websocketConfigSchema
  ),
  cooldownSeconds: Joi.number().integer().min(30).max(86_400),
  deduplication: deduplicationSchema,
  rateLimit: rateLimitSchema,
  template: templateSchema,
  status: Joi.string().valid('active', 'paused', 'archived'),
  metadata: Joi.object().unknown(true),
}).min(1).unknown(false);

export const listAlertsQuerySchema = Joi.object({
  status: Joi.string().valid('active', 'paused', 'archived'),
  protocol: Joi.string().lowercase(),
  alertType: Joi.string().valid(...ALL_ALERT_TYPES),
  channel: Joi.string().valid('webhook', 'email', 'websocket'),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const alertIdParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
}).unknown(false);

export const listAlertEventsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  cursor: Joi.string().max(500).optional(),
}).unknown(false);