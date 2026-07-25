/**
 * @fileoverview Role-Based Access Control (RBAC) middleware
 * @description Enforces role-based authorization on Express REST endpoints
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-07-25
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthErrorCode } from '../types/auth-types';
import { AuditLogger } from '../services/audit-logger';

const auditLogger = new AuditLogger();

/**
 * Roles supported by the RBAC system.
 */
export enum Role {
  ADMIN = 'admin',
  MANAGER = 'manager',
  OPERATOR = 'operator',
  AUDITOR = 'auditor',
}

/**
 * Require the authenticated user to hold one of the given roles.
 * The `admin` role always passes, matching the wildcard/admin bypass
 * convention used by the permission-based middleware in `auth.ts`.
 * @param roles - Roles allowed to access the endpoint (case-insensitive)
 * @returns Express middleware function
 */
export function requireRole(roles: string[]): RequestHandler {
  const allowedRoles = roles.map((role) => role.toLowerCase());

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.MISSING_TOKEN,
            message: 'Authentication required',
            details: {},
          },
        });
        return;
      }

      const userRole = (req.user.role || '').toLowerCase();
      const hasRole = userRole === Role.ADMIN || allowedRoles.includes(userRole);

      if (!hasRole) {
        void auditLogger.log({
          user_id: req.user.userId,
          action: 'rbac.access_denied',
          resource: req.originalUrl,
          ip_address: req.ip || null,
          success: false,
          error_code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
          metadata: {
            requiredRoles: roles,
            userRole: req.user.role || null,
          },
        });
        res.status(403).json({
          error: {
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            message: `Insufficient role. Required one of: ${roles.join(', ')}`,
            details: {
              requiredRoles: roles,
              userRole: req.user.role || null,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INTERNAL_ERROR,
          message: 'Internal server error during role check',
          details: {},
        },
      });
    }
  };
}
