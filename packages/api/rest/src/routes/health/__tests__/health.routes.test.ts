import express from 'express';
import request from 'supertest';
import { setupHealthRoutes } from '../index';
import { HealthOrchestrator } from '../../../services/monitoring/health';
import { HealthChecker } from '../../../types/monitoring-health-types';

function orchestrator(checkers: HealthChecker[]) {
  return new HealthOrchestrator(checkers, {
    timeoutMs: 100,
    version: 'test',
    now: () => new Date('2026-07-19T00:00:00Z'),
    startedAt: new Date('2026-07-19T00:00:00Z'),
  });
}

function makeApp(checkers: HealthChecker[]) {
  const app = express();
  app.use(setupHealthRoutes({ orchestrator: orchestrator(checkers) }));
  return app;
}

describe('health routes', () => {
  it('GET /health/live is always 200', async () => {
    const app = makeApp([
      {
        name: 'db', critical: true,
        check: async () => { throw new Error('DB DOWN'); },
      },
    ]);
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('up');
  });

  it('GET /health returns 200 with degraded aggregate when non-critical fails', async () => {
    const app = makeApp([
      { name: 'db', critical: true, check: async () => ({ name: 'db', status: 'up', latencyMs: 1 }) },
      { name: 'oracle', critical: false, check: async () => ({ name: 'oracle', status: 'degraded', latencyMs: 1 }) },
    ]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.components).toHaveLength(2);
  });

  it('GET /health returns 503 when a component is down', async () => {
    const app = makeApp([
      { name: 'db', critical: true, check: async () => ({ name: 'db', status: 'down', latencyMs: 1 }) },
    ]);
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('down');
  });

  it('GET /health/ready returns 200 when critical deps are up even if non-critical is down', async () => {
    const app = makeApp([
      { name: 'db', critical: true, check: async () => ({ name: 'db', status: 'up', latencyMs: 1 }) },
      { name: 'oracle', critical: false, check: async () => ({ name: 'oracle', status: 'down', latencyMs: 1 }) },
    ]);
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.components).toHaveLength(1);
    expect(res.body.components[0].name).toBe('db');
  });

  it('GET /health/ready returns 503 when a critical dep is down', async () => {
    const app = makeApp([
      { name: 'db', critical: true, check: async () => ({ name: 'db', status: 'down', latencyMs: 1 }) },
    ]);
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(503);
  });
});
