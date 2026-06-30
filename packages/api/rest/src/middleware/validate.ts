/**
 * @fileoverview Generic Joi validation middleware
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import Joi from 'joi';

type Source = 'body' | 'query' | 'params';

export function validate(schema: Joi.Schema, source: Source = 'body'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.details.map((d) => ({ path: d.path, message: d.message })),
        },
      });
      return;
    }

    // Replace the request slot with the coerced/cleaned value so downstream handlers
    // receive the canonical shape (e.g. defaults applied, types coerced).
    (req as unknown as Record<Source, unknown>)[source] = value;
    next();
  };
}
