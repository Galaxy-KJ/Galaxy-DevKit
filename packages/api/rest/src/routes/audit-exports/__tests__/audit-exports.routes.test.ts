import express from 'express';
import request from 'supertest';
import { setupAuditExportRoutes } from '../index';
import { AuditExportError } from '../../../types/audit-export-types';

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

function buildApp(engine: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/audit-exports', setupAuditExportRoutes(engine as never));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message, details: {} } });
  });
  return app;
}

describe('audit export routes', () => {
  const sampleExport = {
    id: 'exp-1',
    userId: 'user-1',
    format: 'json' as const,
    status: 'completed' as const,
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-20T00:00:00.000Z'),
    filterAction: null,
    filterResource: null,
    incremental: false,
    recordCount: 1,
    chainRootHash: 'root-hash',
    content: '{"entries":[]}',
    contentType: 'application/json',
    errorMessage: null,
    createdAt: new Date('2026-07-21T00:00:00.000Z'),
    completedAt: new Date('2026-07-21T00:00:01.000Z'),
  };

  it('starts a background export and returns 202 with a pending/queued record', async () => {
    const engine = { startExport: jest.fn().mockResolvedValue({ ...sampleExport, status: 'pending' }) };
    const res = await request(buildApp(engine)).post('/api/v1/audit-exports').send({
      format: 'json',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-20T00:00:00.000Z',
    });

    expect(res.status).toBe(202);
    expect(res.body.export.id).toBe('exp-1');
    expect(engine.startExport).toHaveBeenCalled();
  });

  it('rejects invalid create body', async () => {
    const engine = { startExport: jest.fn() };
    const res = await request(buildApp(engine)).post('/api/v1/audit-exports').send({ format: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists exports', async () => {
    const engine = { listExports: jest.fn().mockResolvedValue([sampleExport]) };
    const res = await request(buildApp(engine)).get('/api/v1/audit-exports');
    expect(res.status).toBe(200);
    expect(res.body.exports).toHaveLength(1);
  });

  it('gets export status/metadata for polling', async () => {
    const engine = { getExport: jest.fn().mockResolvedValue(sampleExport) };
    const res = await request(buildApp(engine)).get('/api/v1/audit-exports/exp-1');
    expect(res.status).toBe(200);
    expect(res.body.export.status).toBe('completed');
    expect(res.body.export.chainRootHash).toBe('root-hash');
  });

  it('downloads completed export content', async () => {
    const engine = { getExport: jest.fn().mockResolvedValue(sampleExport) };
    const res = await request(buildApp(engine)).get('/api/v1/audit-exports/exp-1/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.text).toContain('entries');
  });

  it('returns 409 when downloading a non-completed export', async () => {
    const engine = {
      getExport: jest.fn().mockResolvedValue({ ...sampleExport, status: 'processing', content: null }),
    };
    const res = await request(buildApp(engine)).get('/api/v1/audit-exports/exp-1/download');
    expect(res.status).toBe(409);
  });

  it('verifies an export chain and returns the result', async () => {
    const engine = {
      verifyExport: jest.fn().mockResolvedValue({
        valid: true,
        tamperedIndex: null,
        expectedRootHash: 'root-hash',
        actualRootHash: 'root-hash',
      }),
    };
    const res = await request(buildApp(engine)).post('/api/v1/audit-exports/exp-1/verify');
    expect(res.status).toBe(200);
    expect(res.body.verification.valid).toBe(true);
  });

  it('maps AuditExportError to the corresponding http status', async () => {
    const engine = {
      getExport: jest.fn().mockRejectedValue(new AuditExportError('NOT_FOUND', 'Export not found', 404)),
    };
    const res = await request(buildApp(engine)).get('/api/v1/audit-exports/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
