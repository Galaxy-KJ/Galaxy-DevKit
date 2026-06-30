/**
 * @fileoverview Organization team management routes
 */

import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { auditRequest } from '../../middleware/audit';
import { getTeamService, TeamRole } from '../../services/team-service';

const VALID_ROLES: TeamRole[] = ['admin', 'member', 'viewer'];

export function setupTeamRoutes(): express.Router {
  const router = express.Router();
  const teamService = getTeamService();

  router.use(authenticate(), auditRequest());

  router.get('/:organizationId/members', (req: Request, res: Response) => {
    const members = teamService.listMembers(req.params.organizationId);
    return res.status(200).json({ members });
  });

  router.post('/:organizationId/invite', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role } = req.body ?? {};

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'email is required',
            details: {},
          },
        });
      }

      const normalizedRole = (role ?? 'member') as TeamRole;
      if (!VALID_ROLES.includes(normalizedRole)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'role must be admin, member, or viewer',
            details: {},
          },
        });
      }

      const member = teamService.inviteMember({
        organizationId: req.params.organizationId,
        email,
        role: normalizedRole,
      });

      return res.status(201).json({ member });
    } catch (error) {
      next(error);
    }
  });

  router.put('/members/:memberId/role', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body ?? {};
      if (!role || !VALID_ROLES.includes(role)) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'role must be admin, member, or viewer',
            details: {},
          },
        });
      }

      const member = teamService.updateMemberRole(req.params.memberId, role);
      return res.status(200).json({ member });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({
          error: {
            code: 'MEMBER_NOT_FOUND',
            message: error.message,
            details: {},
          },
        });
      }
      next(error);
    }
  });

  router.get('/:organizationId/activity', (req: Request, res: Response) => {
    const activity = teamService.listActivity(req.params.organizationId);
    return res.status(200).json({ activity });
  });

  return router;
}
