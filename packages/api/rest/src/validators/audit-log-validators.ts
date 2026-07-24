/**
 * @fileoverview Joi schemas for the audit log query routes.
 * @author Galaxy DevKit Team
 * @since 2026-07-22
 */

import Joi from 'joi';

export const listAuditLogsQuerySchema = Joi.object({
  action: Joi.string().optional(),
  resource: Joi.string().optional(),
  organizationId: Joi.string().optional(),
  severity: Joi.string().valid('info', 'warning', 'critical').optional(),
  correlationId: Joi.string().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().min(Joi.ref('from')).optional(),
  cursor: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
}).unknown(false);
