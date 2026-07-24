import express from 'express';
import request from 'supertest';
import { setupAuditLogRoutes } from '../index';
import { AuditEvent } from '../../../services/audit-logger';

jest.mock('../../../middleware/auth', () => ({
  authenticate: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      userId: 'user-1',
      email: 'user@example.com',
    } as never;
    next();
  },
}));

jest.mock('../../../middleware/audit', () => ({
  auditRequest: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

function buildApp(logger: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/audit-logs', setupAuditLogRoutes(logger as never));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message, details: {} } });
  });
  return app;
}

const sampleEvent: AuditEvent = {
  id: 'log-1',
  timestamp: '2026-07-22T00:00:00.000Z',
  user_id: 'user-1',
  organization_id: 'org-1',
  action: 'defi.blend.supply',
  resource: '/api/v1/defi/blend/supply',
  resource_id: 'GABC...',
  ip_address: '1.2.3.4',
  success: true,
  severity: 'info',
  correlation_id: 'req-1',
  metadata: { asset: 'XLM', amount: '100' },
};

describe('audit log query routes', () => {
  it('lists the caller\'s own audit logs scoped by their userId', async () => {
    const logger = { query: jest.fn().mockResolvedValue({ items: [sampleEvent], nextCursor: null }) };
    const res = await request(buildApp(logger)).get('/api/v1/audit-logs');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].actor).toEqual({ userId: 'user-1', organizationId: 'org-1' });
    expect(res.body.items[0].details).toEqual({ asset: 'XLM', amount: '100' });
    expect(logger.query).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('forwards action/severity/date filters and pagination cursor to the logger', async () => {
    const logger = { query: jest.fn().mockResolvedValue({ items: [], nextCursor: 'next-cursor' }) };
    const res = await request(buildApp(logger)).get('/api/v1/audit-logs').query({
      action: 'defi.blend.supply',
      severity: 'warning',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-22T00:00:00.000Z',
      cursor: 'abc',
      limit: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBe('next-cursor');
    expect(logger.query).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'defi.blend.supply',
        severity: 'warning',
        cursor: 'abc',
        limit: 10,
      })
    );
  });

  it('rejects an invalid severity value', async () => {
    const logger = { query: jest.fn() };
    const res = await request(buildApp(logger)).get('/api/v1/audit-logs').query({ severity: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(logger.query).not.toHaveBeenCalled();
  });

  it('propagates query errors to the error handler', async () => {
    const logger = { query: jest.fn().mockRejectedValue(new Error('db down')) };
    const res = await request(buildApp(logger)).get('/api/v1/audit-logs');

    expect(res.status).toBe(500);
    expect(res.body.error.message).toBe('db down');
  });
});
