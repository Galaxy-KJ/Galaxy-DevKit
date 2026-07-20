import express from 'express';
import request from 'supertest';
import { Counter, Registry } from 'prom-client';
import { setupMetricsRoutes } from '../index';

describe('metrics routes', () => {
  it('GET /metrics returns Prometheus text format with content type set', async () => {
    const registry = new Registry();
    const counter = new Counter({
      name: 'sample_events_total',
      help: 'sample',
      registers: [registry],
    });
    counter.inc(3);

    const app = express();
    app.use(setupMetricsRoutes({ registry }));

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('sample_events_total 3');
  });
});
