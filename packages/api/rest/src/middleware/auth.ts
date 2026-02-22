/**
 * @fileoverview Authentication middleware
 * @description Main authentication middleware supporting both JWT and API key authentication
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth-service';
import {
  AuthenticationError,
  PermissionError,
  AuthErrorCode,
} from '../types/auth-types';
import { extractApiKey } from './api-key';
import { AuditLogger } from '../services/audit-logger';

/**
 * Auth service instance
 */
const authService = new AuthService();
const auditLogger = new AuditLogger();

/**
 * Extract JWT token from request
 * Looks in Authorization header (Bearer token)
 * @param req - Express request
 * @returns string | null - JWT token or null if not found
 */
function extractJWTToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // JWT tokens typically have 3 parts separated by dots
    if (token.includes('.') && token.split('.').length === 3) {
      return token;
    }
  }

  return null;
}

/**
 * Main authentication middleware
 * Supports both JWT and API key authentication
 * @returns Express middleware function
 */
export function authenticate() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First, try API key authentication
      const apiKey = extractApiKey(req);
      if (apiKey) {
        // Validate API key
        const validation = await authService.validateApiKey(apiKey);
        
        if (validation.valid && validation.apiKey && validation.user) {
          // Check if API key is active and not expired
          if (!validation.apiKey.isActive) {
            void auditLogger.log({
              user_id: validation.user?.userId || null,
              action: 'auth.authenticate',
              resource: req.originalUrl,
              ip_address: req.ip || null,
              success: false,
              error_code: AuthErrorCode.REVOKED_API_KEY,
              metadata: {
                authMethod: 'api_key',
                reason: 'revoked_api_key',
              },
            });
            res.status(401).json({
              error: {
                code: AuthErrorCode.REVOKED_API_KEY,
                message: 'API key has been revoked',
                details: {},
              },
            });
            return;
          }

          if (validation.apiKey.expiresAt && validation.apiKey.expiresAt < new Date()) {
            void auditLogger.log({
              user_id: validation.user?.userId || null,
              action: 'auth.authenticate',
              resource: req.originalUrl,
              ip_address: req.ip || null,
              success: false,
              error_code: AuthErrorCode.EXPIRED_API_KEY,
              metadata: {
                authMethod: 'api_key',
                reason: 'expired_api_key',
              },
            });
            res.status(401).json({
              error: {
                code: AuthErrorCode.EXPIRED_API_KEY,
                message: 'API key has expired',
                details: {},
              },
            });
            return;
          }

          // Attach API key and user info to request
          req.apiKey = validation.apiKey;
          req.user = validation.user;
          req.authMethod = 'api_key';
          req.permissions = validation.user.permissions;
          next();
          return;
        }
        // If API key is invalid, fall through to JWT
      }

      // Try JWT authentication
      await authenticateWithJWT(req, res, next);
    } catch (error) {
      console.error('Authentication middleware error:', error);
      void auditLogger.log({
        user_id: null,
        action: 'auth.authenticate',
        resource: req.originalUrl,
        ip_address: req.ip || null,
        success: false,
        error_code: AuthErrorCode.INVALID_TOKEN,
        metadata: {
          authMethod: req.authMethod || 'unknown',
          reason: 'middleware_error',
        },
      });
      res.status(500).json({
        error: {
          code: AuthErrorCode.INVALID_TOKEN,
          message: 'Internal server error during authentication',
          details: {},
        },
      });
    }
  };
}

/**
 * Authenticate with JWT token
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
async function authenticateWithJWT(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractJWTToken(req);

    if (!token) {
      void auditLogger.log({
        user_id: null,
        action: 'auth.authenticate',
        resource: req.originalUrl,
        ip_address: req.ip || null,
        success: false,
        error_code: AuthErrorCode.MISSING_TOKEN,
        metadata: {
          authMethod: 'jwt',
          reason: 'missing_token',
        },
      });
      res.status(401).json({
        error: {
          code: AuthErrorCode.MISSING_TOKEN,
          message: 'Authentication required. Please provide a JWT token or API key.',
          details: {},
        },
      });
      return;
    }

    // Validate JWT token
    const validation = await authService.validateAuthToken(token);

    if (!validation.valid || !validation.user) {
      void auditLogger.log({
        user_id: null,
        action: 'auth.authenticate',
        resource: req.originalUrl,
        ip_address: req.ip || null,
        success: false,
        error_code: AuthErrorCode.INVALID_TOKEN,
        metadata: {
          authMethod: 'jwt',
          reason: validation.error || 'invalid_token',
        },
      });
      res.status(401).json({
        error: {
          code: AuthErrorCode.INVALID_TOKEN,
          message: validation.error || 'Invalid authentication token',
          details: {},
        },
      });
      return;
    }

    // Attach user info to request
    req.user = validation.user;
    req.authMethod = 'jwt';
    req.permissions = validation.user.permissions;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      void auditLogger.log({
        user_id: null,
        action: 'auth.authenticate',
        resource: req.originalUrl,
        ip_address: req.ip || null,
        success: false,
        error_code: error.code,
        metadata: {
          authMethod: 'jwt',
          reason: error.message,
        },
      });
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          details: {},
        },
      });
      return;
    }

    console.error('JWT authentication error:', error);
    void auditLogger.log({
      user_id: null,
      action: 'auth.authenticate',
      resource: req.originalUrl,
      ip_address: req.ip || null,
      success: false,
      error_code: AuthErrorCode.INVALID_TOKEN,
      metadata: {
        authMethod: 'jwt',
        reason: 'jwt_error',
      },
    });
    res.status(500).json({
      error: {
        code: AuthErrorCode.INVALID_TOKEN,
        message: 'Internal server error during authentication',
        details: {},
      },
    });
  }
}

/**
 * Optional authentication middleware
 * Authenticates if token is provided, but doesn't require it
 * @returns Express middleware function
 */
export function optionalAuthenticate() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Try API key first
      const apiKey = extractApiKey(req);
      if (apiKey) {
        // Validate API key
        const validation = await authService.validateApiKey(apiKey);
        
        if (validation.valid && validation.apiKey && validation.user) {
          // Check if API key is active and not expired
          if (!validation.apiKey.isActive) {
            // Continue without authentication
          } else if (validation.apiKey.expiresAt && validation.apiKey.expiresAt < new Date()) {
            // Continue without authentication
          } else {
            // Attach API key and user info to request
            req.apiKey = validation.apiKey;
            req.user = validation.user;
            req.authMethod = 'api_key';
            req.permissions = validation.user.permissions;
          }
        }
        // Continue regardless
        next();
        return;
      }

      // Try JWT
      const token = extractJWTToken(req);
      if (token) {
        const validation = await authService.validateAuthToken(token);
        if (validation.valid && validation.user) {
          req.user = validation.user;
          req.authMethod = 'jwt';
          req.permissions = validation.user.permissions;
        }
      }

      // Continue regardless of authentication status
      next();
    } catch (error) {
      // On error, continue without authentication
      console.error('Optional authentication error:', error);
      next();
    }
  };
}

/**
 * Require specific permission middleware
 * Requires user to have a specific permission
 * @param permission - Required permission
 * @returns Express middleware function
 */
export function requirePermission(permission: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure user is authenticated
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

      // If authenticated with API key, check API key scopes first
      if (req.authMethod === 'api_key' && req.apiKey) {
        const apiKeyScopes = req.apiKey.scopes || [];
        // Check if API key has the required permission in its scopes
        // '*' means all permissions
        const hasScope = apiKeyScopes.includes(permission) || apiKeyScopes.includes('*');
        
        if (!hasScope) {
          res.status(403).json({
            error: {
              code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
              message: `Insufficient permissions. Required: ${permission}`,
              details: {
                requiredPermission: permission,
                apiKeyScopes: apiKeyScopes,
              },
            },
          });
          return;
        }
        // If API key scope allows, continue to user-based permission check as fallback
      }

      // Check if user has permission
      const hasPermission = await authService.checkPermission(
        req.user.userId,
        permission
      );

      if (!hasPermission) {
        res.status(403).json({
          error: {
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            message: `Insufficient permissions. Required: ${permission}`,
            details: {
              requiredPermission: permission,
              userPermissions: req.permissions || [],
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Internal server error during permission check',
          details: {},
        },
      });
    }
  };
}

/**
 * Require any of the specified permissions
 * User must have at least one of the provided permissions
 * @param permissions - Array of required permissions (user needs at least one)
 * @returns Express middleware function
 */
export function requireAnyPermission(permissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure user is authenticated
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

      // Check if user has any of the required permissions
      const userPermissions = req.permissions || [];
      // Wildcard '*' grants full access
      const hasAnyPermission =
        userPermissions.includes('*') ||
        permissions.some((permission) =>
          userPermissions.includes(permission) || userPermissions.includes('admin')
        );

      if (!hasAnyPermission) {
        res.status(403).json({
          error: {
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            message: `Insufficient permissions. Required one of: ${permissions.join(', ')}`,
            details: {
              requiredPermissions: permissions,
              userPermissions: userPermissions,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Internal server error during permission check',
          details: {},
        },
      });
    }
  };
}

/**
 * Require all of the specified permissions
 * User must have all of the provided permissions
 * @param permissions - Array of required permissions (user needs all)
 * @returns Express middleware function
 */
export function requireAllPermissions(permissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure user is authenticated
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

      // Check if user has all required permissions
      const userPermissions = req.permissions || [];
      // Wildcard '*' grants full access
      const hasAllPermissions =
        userPermissions.includes('*') ||
        permissions.every(
          (permission) =>
            userPermissions.includes(permission) || userPermissions.includes('admin')
        );

      if (!hasAllPermissions) {
        res.status(403).json({
          error: {
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            message: `Insufficient permissions. Required all of: ${permissions.join(', ')}`,
            details: {
              requiredPermissions: permissions,
              userPermissions: userPermissions,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Internal server error during permission check',
          details: {},
        },
      });
    }
  };
}

/**
 * Require admin permission
 * Shortcut for requiring 'admin' permission
 * @returns Express middleware function
 */
export function requireAdmin() {
  return requirePermission('admin');
}
