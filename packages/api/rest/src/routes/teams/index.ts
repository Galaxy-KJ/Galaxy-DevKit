/**
 * @fileoverview Routes for Team Accounts & Workspace organization (Issue #313 / Roadmap #61).
 * @description CRUD for organizations plus membership management. All member
 *              endpoints defer cross-org access enforcement to the service
 *              layer (TeamsService.assertMembership).
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

import express, { NextFunction, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { validate } from '../../middleware/validate';
import { TeamsService } from '../../services/teams.service';
import { TeamsError } from '../../types/teams-types';
import {
  createOrganizationSchema,
  inviteMemberSchema,
  listActivityQuerySchema,
  orgIdParamSchema,
  orgMemberIdParamSchema,
  updateMemberSchema,
} from '../../validators/teams-validators';

function requireUser(req: Request, res: Response): string | null {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'AUTH_ERROR', message: 'Authentication required', details: {} },
    });
    return null;
  }
  return req.user.userId;
}

function handleTeamsError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof TeamsError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  next(err);
}

export function setupTeamRoutes(
  service: TeamsService = new TeamsService()
): express.Router {
  const router = express.Router();

  router.use(authenticate(), auditRequest());

  // POST /teams/organizations — create a new team workspace (caller becomes owner).
  router.post(
    '/organizations',
    validate(createOrganizationSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const organization = await service.createOrganization(userId, req.body);
        res.status(201).json({ organization });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // GET /teams/organizations — list orgs the current user belongs to (workspace switcher).
  router.get('/organizations', async (req, res, next) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const organizations = await service.listOrganizationsForUser(userId);
      res.json({ organizations });
    } catch (err) {
      handleTeamsError(err, res, next);
    }
  });

  // GET /teams/organizations/:orgId — fetch one org (membership required).
  router.get(
    '/organizations/:orgId',
    validate(orgIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const organization = await service.getOrganizationForUser(
          req.params.orgId,
          userId
        );
        res.json({ organization });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // POST /teams/organizations/:orgId/invite — add a member by email (admin+).
  router.post(
    '/organizations/:orgId/invite',
    validate(orgIdParamSchema, 'params'),
    validate(inviteMemberSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const member = await service.inviteMember(req.params.orgId, userId, req.body);
        res.status(201).json({ member });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // GET /teams/organizations/:orgId/members — roster (any member can read).
  router.get(
    '/organizations/:orgId/members',
    validate(orgIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const members = await service.listMembersForUser(req.params.orgId, userId);
        res.json({ members });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // PATCH /teams/organizations/:orgId/members/:memberId — change role (admin+).
  router.patch(
    '/organizations/:orgId/members/:memberId',
    validate(orgMemberIdParamSchema, 'params'),
    validate(updateMemberSchema, 'body'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const member = await service.updateMemberRole(
          req.params.orgId,
          userId,
          req.params.memberId,
          req.body.role
        );
        res.json({ member });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // DELETE /teams/organizations/:orgId/members/:memberId — remove member (admin+).
  router.delete(
    '/organizations/:orgId/members/:memberId',
    validate(orgMemberIdParamSchema, 'params'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        await service.removeMember(req.params.orgId, userId, req.params.memberId);
        res.status(204).send();
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  // GET /teams/organizations/:orgId/activity — audit trail.
  router.get(
    '/organizations/:orgId/activity',
    validate(orgIdParamSchema, 'params'),
    validate(listActivityQuerySchema, 'query'),
    async (req, res, next) => {
      const userId = requireUser(req, res);
      if (!userId) return;
      try {
        const page = await service.listActivityForUser(
          req.params.orgId,
          userId,
          {
            limit: Number(req.query.limit),
            cursor: req.query.cursor as string | undefined,
          }
        );
        res.json({ activity: page.items, nextCursor: page.nextCursor });
      } catch (err) {
        handleTeamsError(err, res, next);
      }
    }
  );

  return router;
}
