/**
 * @fileoverview Express type extensions
 * @description Extends Express Request interface with authentication properties
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { UserInfo, ApiKey, Session, AuthMethod } from './auth-types';

declare global {
  namespace Express {
    export interface Request {
      user?: UserInfo;
      apiKey?: ApiKey;
      authMethod?: AuthMethod;
      permissions?: string[];
      session?: Session;
    }
  }
}

