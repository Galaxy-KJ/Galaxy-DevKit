/**
 * @fileoverview API key middleware for authentication
 * @description Handles API key extraction and validation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth-service';
import { AuthenticationError, AuthErrorCode } from '../types/auth-types';

/**
 * Auth service instance
 */
const authService = new AuthService();

/**
 * Extract API key from request
 * Looks in Authorization header (Bearer token) or x-api-key header
 * @param req - Express request
 * @returns string | null - API key or null if not found
 */
export function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Check if it looks like an API key (base64-like string, longer than JWT)
    // JWT tokens are typically shorter and have 3 parts separated by dots
    if (!token.includes('.') && token.length > 32) {
      return token;
    }
  }

  // Check x-api-key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  // Check query parameter (less secure, but sometimes needed)
  const apiKeyQuery = req.query.api_key;
  if (apiKeyQuery && typeof apiKeyQuery === 'string') {
    return apiKeyQuery;
  }

  return null;
}

/**
 * API key validation middleware
 * Validates API key and attaches API key info to request
 * @returns Express middleware function
 */
export function apiKeyMiddleware() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const apiKey = extractApiKey(req);

      if (!apiKey) {
        next();
        return; // Continue without API key (might use JWT instead)
      }

      // Validate API key
      const validation = await authService.validateApiKey(apiKey);

      if (!validation.valid || !validation.apiKey || !validation.user) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.INVALID_API_KEY,
            message: validation.error || 'Invalid API key',
            details: {},
          },
        });
        return;
      }

      // Check if API key is active
      if (!validation.apiKey.isActive) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.REVOKED_API_KEY,
            message: 'API key has been revoked',
            details: {},
          },
        });
        return;
      }

      // Check if API key is expired
      if (validation.apiKey.expiresAt && validation.apiKey.expiresAt < new Date()) {
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
    } catch (error) {
      console.error('API key middleware error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INVALID_API_KEY,
          message: 'Internal server error during API key validation',
          details: {},
        },
      });
    }
  };
}

/**
 * Require API key middleware
 * Requires API key authentication (fails if no API key provided)
 * @returns Express middleware function
 */
export function requireApiKey() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const apiKey = extractApiKey(req);

      if (!apiKey) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.MISSING_TOKEN,
            message: 'API key is required',
            details: {},
          },
        });
        return;
      }

      // Validate API key
      const validation = await authService.validateApiKey(apiKey);

      if (!validation.valid || !validation.apiKey || !validation.user) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.INVALID_API_KEY,
            message: validation.error || 'Invalid API key',
            details: {},
          },
        });
        return;
      }

      // Check if API key is active
      if (!validation.apiKey.isActive) {
        res.status(401).json({
          error: {
            code: AuthErrorCode.REVOKED_API_KEY,
            message: 'API key has been revoked',
            details: {},
          },
        });
        return;
      }

      // Check if API key is expired
      if (validation.apiKey.expiresAt && validation.apiKey.expiresAt < new Date()) {
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
    } catch (error) {
      console.error('Require API key middleware error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INVALID_API_KEY,
          message: 'Internal server error during API key validation',
          details: {},
        },
      });
    }
  };
}

/**
 * Require API key scope middleware
 * Requires API key with specific scope
 * @param scope - Required scope
 * @returns Express middleware function
 */
export function requireScope(scope: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // First ensure API key is present
      if (!req.apiKey || req.authMethod !== 'api_key') {
        res.status(401).json({
          error: {
            code: AuthErrorCode.INVALID_API_KEY,
            message: 'API key is required',
            details: {},
          },
        });
        return;
      }

      // Check if API key has required scope
      if (!req.apiKey.scopes.includes(scope) && !req.apiKey.scopes.includes('*')) {
        res.status(403).json({
          error: {
            code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
            message: `API key does not have required scope: ${scope}`,
            details: {
              requiredScope: scope,
              availableScopes: req.apiKey.scopes,
            },
          },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Require scope middleware error:', error);
      res.status(500).json({
        error: {
          code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Internal server error during scope validation',
          details: {},
        },
      });
    }
  };
}

