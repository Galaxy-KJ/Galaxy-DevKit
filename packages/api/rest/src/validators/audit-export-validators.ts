/**
 * @fileoverview Joi schemas for audit trail export routes.
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

import Joi from 'joi';

const exportFormat = Joi.string().valid('json', 'csv', 'archive').default('json');

export const createExportSchema = Joi.object({
  format: exportFormat,
  from: Joi.date().iso().required(),
  to: Joi.date().iso().min(Joi.ref('from')).required(),
  filters: Joi.object({
    action: Joi.string().optional(),
    resource: Joi.string().optional(),
  })
    .default({})
    .unknown(false),
  incremental: Joi.boolean().default(false),
}).unknown(false);

export const listExportsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
}).unknown(false);

export const exportIdParamSchema = Joi.object({
  id: Joi.string().min(1).required(),
}).unknown(false);
