/**
 * @fileoverview Request context middleware
 * @description Assigns a request id and attaches a request-scoped logger
 */

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Request, RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { logger as rootLogger, type Logger } from '@galaxy-kj/api-logger';

const REQUEST_ID_PATTERN = /^[\w.-]{1,128}$/;

export interface RequestContextOptions {
  logger?: Logger;
}

function resolveRequestId(header: string | string[] | undefined): string {
  if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) {
    return header;
  }
  return randomUUID();
}

/**
 * Returns the request-scoped logger when the request context middleware ran,
 * otherwise the given fallback.
 */
export function requestLogger(req: Request, fallback: Logger): Logger {
  return (req as Partial<Request>).log ?? fallback;
}

export function requestContext(options: RequestContextOptions = {}): RequestHandler {
  const http = pinoHttp({
    logger: options.logger ?? rootLogger,
    genReqId: (req: IncomingMessage) => req.headers['x-request-id'] as string,
  });

  return (req, res, next) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);
    http(req as IncomingMessage, res as ServerResponse, () => {
      req.log = req.log.child({ requestId });
      next();
    });
  };
}
