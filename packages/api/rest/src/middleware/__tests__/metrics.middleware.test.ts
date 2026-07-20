import express from 'express';
import request from 'supertest';
import { Registry } from 'prom-client';
import { httpMetricsMiddleware } from '../metrics';
import { getHttpMetrics, __resetHttpMetricsForTests } from '../../services/monitoring/metrics/http-metrics';

describe('httpMetricsMiddleware', () => {
  beforeEach(() => {
    __resetHttpMetricsForTests();
  });

  it('records requests using the route pattern, not the full URL', async () => {
    const registry = new Registry();
    const metrics = getHttpMetrics(registry);

    const app = express();
    app.use(httpMetricsMiddleware({ metrics }));
    app.get('/users/:id', (_req, res) => res.status(200).json({}));

    await request(app).get('/users/123');
    await request(app).get('/users/456');

    const output = await registry.metrics();
    expect(output).toMatch(/route="\/users\/:id"/);
    expect(output).not.toMatch(/route="\/users\/123"/);
  });

  it('skips the excluded health and metrics paths', async () => {
    const registry = new Registry();
    const metrics = getHttpMetrics(registry);

    const app = express();
    app.use(httpMetricsMiddleware({ metrics }));
    app.get('/health', (_req, res) => res.status(200).json({}));
    app.get('/metrics', (_req, res) => res.status(200).json({}));

    await request(app).get('/health');
    await request(app).get('/metrics');

    const output = await registry.metrics();
    expect(output).not.toMatch(/route="\/health"/);
    expect(output).not.toMatch(/route="\/metrics"/);
  });

  it('captures the response status code', async () => {
    const registry = new Registry();
    const metrics = getHttpMetrics(registry);

    const app = express();
    app.use(httpMetricsMiddleware({ metrics }));
    app.get('/boom', (_req, res) => res.status(500).json({}));

    await request(app).get('/boom');
    const output = await registry.metrics();
    expect(output).toMatch(/status_code="500"/);
  });
});
