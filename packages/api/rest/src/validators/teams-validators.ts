/**
 * @fileoverview Joi schemas for the Team Accounts / Workspace routes
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

import Joi from 'joi';

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
// Owner promotion via the invite endpoint is intentionally excluded — a second
// owner can only be created via role updates by an existing owner.
const INVITE_ROLES = ['admin', 'member', 'viewer'] as const;

// Matches the DB constraint: lowercase alphanumerics separated by single hyphens.
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createOrganizationSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  slug: Joi.string().pattern(SLUG_REGEX).min(1).max(60).optional().messages({
    'string.pattern.base':
      'slug must be lowercase alphanumerics separated by single hyphens',
  }),
  metadata: Joi.object().unknown(true).default({}),
}).unknown(false);

export const inviteMemberSchema = Joi.object({
  // tlds: { allow: false } disables the RFC TLD whitelist so local test
  // domains (.test, .local, .dev) are accepted. Format validation still runs.
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  role: Joi.string().valid(...INVITE_ROLES).default('member'),
}).unknown(false);

export const updateMemberSchema = Joi.object({
  role: Joi.string().valid(...ROLES).required(),
}).unknown(false);

export const orgIdParamSchema = Joi.object({
  orgId: Joi.string().uuid().required(),
}).unknown(false);

export const orgMemberIdParamSchema = Joi.object({
  orgId: Joi.string().uuid().required(),
  memberId: Joi.string().uuid().required(),
}).unknown(false);

export const listActivityQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  cursor: Joi.string().max(500).optional(),
}).unknown(false);
