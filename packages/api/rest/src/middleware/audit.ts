/**
 * @fileoverview Audit middleware
 * @description Logs authenticated requests for audit trails
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-02-22
 */

import { Request, Response, NextFunction } from 'express';
import { AuditLogger } from '../services/audit-logger';

const auditLogger = new AuditLogger();

export function auditRequest() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId || null;

    if (!userId) {
      next();
      return;
    }

    const startTime = Date.now();
    const resource = `${req.baseUrl}${req.path}` || req.originalUrl;

    res.on('finish', () => {
      const success = res.statusCode < 400;

      void auditLogger.log({
        user_id: userId,
        action: `http.${req.method.toLowerCase()}`,
        resource,
        ip_address: req.ip || null,
        success,
        metadata: {
          requestId: req.headers['x-request-id'],
          statusCode: res.statusCode,
          durationMs: Date.now() - startTime,
          authMethod: req.authMethod,
        },
      });
    });

    next();
  };
}
