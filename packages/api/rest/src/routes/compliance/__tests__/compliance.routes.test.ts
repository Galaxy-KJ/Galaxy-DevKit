import express from 'express';
import request from 'supertest';
import { setupComplianceRoutes } from '../index';
import { ComplianceError } from '../../../types/compliance-types';

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

function buildApp(engine: unknown, repository: unknown = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/compliance', setupComplianceRoutes(engine as never, repository as never));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message, details: {} } });
  });
  return app;
}

describe('compliance routes', () => {
  const sampleReport = {
    id: 'rep-1',
    userId: 'user-1',
    reportType: 'transaction' as const,
    format: 'json' as const,
    status: 'completed' as const,
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-31T23:59:59.999Z'),
    scheduleId: null,
    idempotencyKey: 'key',
    redactPii: true,
    rowCount: 1,
    content: '{"rows":[]}',
    contentType: 'application/json',
    errorMessage: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    completedAt: new Date('2026-07-17T00:00:01.000Z'),
  };

  it('lists templates', async () => {
    const engine = {
      listTemplates: jest.fn().mockReturnValue([
        { type: 'transaction', name: 'Transaction Report', description: 'd', columns: [] },
      ]),
    };
    const res = await request(buildApp(engine)).get('/api/v1/compliance/templates');
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
  });

  it('generates a report on demand', async () => {
    const engine = {
      generate: jest.fn().mockResolvedValue(sampleReport),
      listTemplates: jest.fn(),
    };
    const res = await request(buildApp(engine))
      .post('/api/v1/compliance/reports')
      .send({
        reportType: 'transaction',
        format: 'json',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T23:59:59.999Z',
        redactPii: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.report.id).toBe('rep-1');
    expect(engine.generate).toHaveBeenCalled();
  });

  it('rejects invalid generate body', async () => {
    const engine = { generate: jest.fn() };
    const res = await request(buildApp(engine))
      .post('/api/v1/compliance/reports')
      .send({ reportType: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('lists reports', async () => {
    const engine = {
      listReports: jest.fn().mockResolvedValue([sampleReport]),
    };
    const res = await request(buildApp(engine)).get('/api/v1/compliance/reports');
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(1);
    expect(res.body.reports[0].content).toBeUndefined();
  });

  it('downloads completed report content', async () => {
    const engine = {
      getReport: jest.fn().mockResolvedValue(sampleReport),
    };
    const res = await request(buildApp(engine)).get('/api/v1/compliance/reports/rep-1/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.text).toContain('rows');
  });

  it('maps compliance errors to http status', async () => {
    const engine = {
      getReport: jest
        .fn()
        .mockRejectedValue(new ComplianceError('NOT_FOUND', 'Report not found', 404)),
    };
    const res = await request(buildApp(engine)).get('/api/v1/compliance/reports/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('creates and lists schedules', async () => {
    const engine = {};
    const repository = {
      createSchedule: jest.fn().mockResolvedValue({
        id: 'sched-1',
        userId: 'user-1',
        reportType: 'user_activity',
        format: 'csv',
        cadence: 'weekly',
        redactPii: true,
        enabled: true,
        nextRunAt: new Date('2026-07-24T00:00:00.000Z'),
        lastRunAt: null,
        createdAt: new Date('2026-07-17T00:00:00.000Z'),
        updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      }),
      listSchedules: jest.fn().mockResolvedValue([]),
    };

    const app = buildApp(engine, repository);
    const createRes = await request(app).post('/api/v1/compliance/schedules').send({
      reportType: 'user_activity',
      format: 'csv',
      cadence: 'weekly',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.schedule.id).toBe('sched-1');

    const listRes = await request(app).get('/api/v1/compliance/schedules');
    expect(listRes.status).toBe(200);
    expect(listRes.body.schedules).toEqual([]);
  });
});
