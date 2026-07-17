/**
 * @fileoverview Joi schemas for compliance reporting routes.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import Joi from 'joi';

const reportType = Joi.string()
  .valid('transaction', 'defi_activity', 'user_activity', 'risk_exposure')
  .required();

const reportFormat = Joi.string().valid('json', 'csv', 'pdf').default('json');

export const generateReportSchema = Joi.object({
  reportType,
  format: reportFormat,
  from: Joi.date().iso().required(),
  to: Joi.date().iso().min(Joi.ref('from')).required(),
  redactPii: Joi.boolean().default(true),
}).unknown(false);

export const listReportsQuerySchema = Joi.object({
  reportType: Joi.string()
    .valid('transaction', 'defi_activity', 'user_activity', 'risk_exposure')
    .optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const reportIdParamSchema = Joi.object({
  id: Joi.string().min(1).required(),
}).unknown(false);

export const createScheduleSchema = Joi.object({
  reportType,
  format: reportFormat,
  cadence: Joi.string().valid('daily', 'weekly', 'monthly').required(),
  redactPii: Joi.boolean().default(true),
}).unknown(false);

export const scheduleIdParamSchema = Joi.object({
  id: Joi.string().min(1).required(),
}).unknown(false);
