import Joi from 'joi';
import { StrKey } from '@stellar/stellar-sdk';

const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;

function stellarAccount(value: string, helpers: Joi.CustomHelpers<string>) {
  if (!StrKey.isValidEd25519PublicKey(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}

function stellarContract(value: string, helpers: Joi.CustomHelpers<string>) {
  if (!StrKey.isValidContract(value)) {
    return helpers.error('any.invalid');
  }
  return value;
}

function stellarAsset(value: string, helpers: Joi.CustomHelpers<string>) {
  const normalized = value.trim();
  if (/^(?:XLM|NATIVE)$/i.test(normalized)) return normalized;

  const parts = normalized.split(':');
  if (parts.length !== 2 || !ASSET_CODE.test(parts[0]) || !StrKey.isValidEd25519PublicKey(parts[1])) {
    return helpers.error('any.invalid');
  }
  return normalized;
}

const account = Joi.string().trim().custom(stellarAccount).messages({
  'any.invalid': '{{#label}} must be a valid Stellar account (G...)',
});
const contract = Joi.string().trim().custom(stellarContract).messages({
  'any.invalid': '{{#label}} must be a valid Stellar contract (C...)',
});
const asset = Joi.string().trim().custom(stellarAsset).messages({
  'any.invalid': '{{#label}} must be XLM, Native, or CODE:ISSUER',
});
const amount = Joi.string().trim().pattern(POSITIVE_DECIMAL).custom((value, helpers) => {
  if (Number(value) <= 0) return helpers.error('number.positive');
  return value;
}).messages({
  'string.pattern.base': '{{#label}} must be a positive decimal amount',
  'number.positive': '{{#label}} must be greater than zero',
});
const optionalAmount = amount.optional();

export const defiQuoteQuerySchema = Joi.object({
  assetIn: asset.required(),
  assetOut: asset.required(),
  amountIn: amount.required(),
}).unknown(false);

export const defiAggregatorQuerySchema = defiQuoteQuerySchema.keys({
  splits: Joi.string().trim().custom((value, helpers) => {
    const values = value.split(',').map((item: string) => Number(item.trim()));
    if (values.length !== 2 || values.some((item: number) => !Number.isFinite(item) || item < 0)) {
      return helpers.error('any.invalid');
    }
    return value;
  }).messages({ 'any.invalid': 'splits must contain exactly two non-negative numeric weights' }).optional(),
});

export const swapSchema = Joi.object({
  assetIn: asset.required(),
  assetOut: asset.required(),
  amountIn: amount.required(),
  minAmountOut: amount.required(),
  signerPublicKey: account.required(),
}).unknown(false);

export const blendOperationSchema = Joi.object({
  asset: asset.required(),
  amount: amount.required(),
  signerPublicKey: account.required(),
}).unknown(false);

export const blendPositionParamsSchema = Joi.object({
  publicKey: account.required(),
}).unknown(false);

export const addLiquiditySchema = Joi.object({
  assetA: asset.required(),
  assetB: asset.required(),
  amountA: amount.required(),
  amountB: amount.required(),
  signerPublicKey: account.required(),
}).unknown(false);

export const removeLiquiditySchema = Joi.object({
  assetA: asset.required(),
  assetB: asset.required(),
  poolAddress: contract.required(),
  lpAmount: amount.required(),
  minAmountA: optionalAmount,
  minAmountB: optionalAmount,
  signerPublicKey: account.required(),
}).unknown(false);

export const poolAnalyticsQuerySchema = Joi.object({
  poolAddress: contract.optional(),
}).unknown(false);
