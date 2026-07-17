/**
 * @fileoverview Joi schemas for monitoring alert routes
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import Joi from 'joi';

const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;

// Production rejects plaintext webhook URLs. Local dev allows http so smoke
// tests against 127.0.0.1 don't need a TLS terminator.
const ALLOWED_WEBHOOK_SCHEMES =
  process.env.NODE_ENV === 'production' ? ['https'] : ['https', 'http'];

const webhookConfigSchema = Joi.object({
  url: Joi.string().uri({ scheme: ALLOWED_WEBHOOK_SCHEMES }).required(),
  secret: Joi.string().min(16).required(),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
}).unknown(false);

const emailConfigSchema = Joi.object({
  to: Joi.string().email().required(),
  subject: Joi.string().max(200).optional(),
}).unknown(false);

const channelConfigSchema = Joi.alternatives()
  .conditional(Joi.ref('/channel'), {
    is: 'webhook',
    then: webhookConfigSchema,
    otherwise: emailConfigSchema,
  });

export const createAlertSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  protocol: Joi.string().lowercase().valid('blend').required(),
  accountAddress: Joi.string().pattern(STELLAR_ACCOUNT_REGEX).required()
    .messages({ 'string.pattern.base': 'accountAddress must be a valid Stellar account (G...)' }),
  network: Joi.string().valid('testnet', 'mainnet').default('testnet'),
  alertType: Joi.string().valid('health_factor_below').required(),
  threshold: Joi.number().positive().required(),
  channel: Joi.string().valid('webhook', 'email').required(),
  channelConfig: channelConfigSchema.required(),
  cooldownSeconds: Joi.number().integer().min(30).max(86_400).default(300),
  metadata: Joi.object().unknown(true).default({}),
}).unknown(false);

export const updateAlertSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  threshold: Joi.number().positive(),
  channelConfig: Joi.alternatives().try(webhookConfigSchema, emailConfigSchema),
  cooldownSeconds: Joi.number().integer().min(30).max(86_400),
  status: Joi.string().valid('active', 'paused', 'archived'),
  metadata: Joi.object().unknown(true),
}).min(1).unknown(false);

export const listAlertsQuerySchema = Joi.object({
  status: Joi.string().valid('active', 'paused', 'archived'),
  protocol: Joi.string().lowercase(),
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
