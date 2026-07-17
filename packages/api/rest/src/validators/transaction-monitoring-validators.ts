import Joi from 'joi';

const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
const UUID = Joi.string().uuid();
const ruleType = Joi.string().valid('large_transfer', 'rapid_transactions', 'unusual_counterparty', 'defi_position_change', 'failed_transactions');

export const organizationParamSchema = Joi.object({ organizationId: UUID.required() }).unknown(false);
export const resourceIdParamSchema = Joi.object({ organizationId: UUID.required(), id: UUID.required() }).unknown(false);
export const addAccountSchema = Joi.object({
  accountAddress: Joi.string().pattern(STELLAR_ACCOUNT_REGEX).required().messages({ 'string.pattern.base': 'accountAddress must be a valid Stellar account (G...)' }),
  network: Joi.string().valid('testnet', 'mainnet').default('testnet'),
}).unknown(false);

const configSchema = Joi.object({
  amountThreshold: Joi.number().positive(),
  countThreshold: Joi.number().integer().min(2),
  windowSeconds: Joi.number().integer().min(1).max(86_400),
  flaggedAccounts: Joi.array().items(Joi.string().pattern(STELLAR_ACCOUNT_REGEX)).max(1000),
  trustedAccounts: Joi.array().items(Joi.string().pattern(STELLAR_ACCOUNT_REGEX)).max(1000),
  changeThreshold: Joi.number().positive(),
}).unknown(false);

export const createTransactionRuleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  ruleType: ruleType.required(),
  config: configSchema.required(),
  severity: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  active: Joi.boolean().default(true),
}).custom((value, helpers) => {
  const required: Record<string, string[]> = {
    large_transfer: ['amountThreshold'], rapid_transactions: ['countThreshold', 'windowSeconds'],
    unusual_counterparty: [], defi_position_change: ['changeThreshold'], failed_transactions: ['countThreshold', 'windowSeconds'],
  };
  for (const key of required[value.ruleType] ?? []) if (value.config[key] === undefined) return helpers.error('any.invalid', { message: `config.${key} is required for ${value.ruleType}` });
  if (value.ruleType === 'unusual_counterparty' && !value.config.flaggedAccounts?.length && !value.config.trustedAccounts?.length) {
    return helpers.error('any.invalid', { message: 'config.flaggedAccounts or config.trustedAccounts is required for unusual_counterparty' });
  }
  return value;
}).unknown(false);

export const updateTransactionRuleSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120), config: configSchema,
  severity: Joi.string().valid('low', 'medium', 'high', 'critical'), active: Joi.boolean(),
}).min(1).unknown(false);
export const paginationSchema = Joi.object({ limit: Joi.number().integer().min(1).max(100).default(50), offset: Joi.number().integer().min(0).default(0) }).unknown(false);
