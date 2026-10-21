/**
 * @fileoverview Route integration tests for Custom Metrics and KPI definition engine.
 * @description Validates full CRUD, owner scoping/isolation, value evaluation,
 *              time-series charting, preview, import/export, and validation errors.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import express from 'express';
import request from 'supertest';
import { setupCustomMetricsRoutes } from '../custom-metrics';
import { MetricsError, MetricsService } from '../../../services/metrics/metrics.service';
import { MetricDefinition, MetricValueResult } from '../../../types/custom-metrics-types';

let currentUser = { userId: 'user-1', email: 'user1@example.com', permissions: [] };

jest.mock('../../../middleware/auth', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = currentUser;
    next();
  },
}));

jest.mock('../../../middleware/audit', () => ({
  auditRequest: () => (_req: any, _res: any, next: any) => next(),
}));

function buildApp(service: Partial<jest.Mocked<MetricsService>>) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/metrics', setupCustomMetricsRoutes(service as MetricsService));
  return app;
}

const sampleDefinition: MetricDefinition = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: 'user-1',
  organizationId: null,
  name: 'avg_swap_size_usd',
  description: 'average swap size in USD, per protocol, 24h rolling',
  source: 'transactions',
  aggregation: 'avg',
  targetField: 'amount',
  window: '24h',
  dimensions: ['protocol', 'asset'],
  filters: [{ field: 'asset', operator: 'eq', value: 'USDC' }],
  unit: 'USD',
  enabled: true,
  formula: null,
  target: 500,
  direction: 'higher_is_better',
  metadata: {},
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

const sampleValueResult: MetricValueResult = {
  metricId: sampleDefinition.id,
  metricName: sampleDefinition.name,
  currentValue: 550.25,
  unit: 'USD',
  window: '24h',
  windowStart: '2026-09-01T00:00:00Z',
  windowEnd: '2026-09-02T00:00:00Z',
  target: 500,
  direction: 'higher_is_better',
  previousValue: 480.0,
  delta: 70.25,
  deltaPct: 14.64,
  trend: 'improving',
  targetMet: true,
  cached: false,
};

describe('Custom Metrics Routes (/api/v1/metrics)', () => {
  beforeEach(() => {
    currentUser = { userId: 'user-1', email: 'user1@example.com', permissions: [] };
  });

  describe('POST /definitions', () => {
    it('creates "average swap size in USD, per protocol, 24h rolling" successfully', async () => {
      const createDefinition = jest.fn().mockResolvedValue(sampleDefinition);
      const app = buildApp({ createDefinition } as any);

      const res = await request(app)
        .post('/api/v1/metrics/definitions')
        .send({
          name: 'avg_swap_size_usd',
          description: 'average swap size in USD, per protocol, 24h rolling',
          source: 'transactions',
          aggregation: 'avg',
          targetField: 'amount',
          window: '24h',
          dimensions: ['protocol', 'asset'],
          filters: [{ field: 'asset', operator: 'eq', value: 'USDC' }],
          unit: 'USD',
          target: 500,
          direction: 'higher_is_better',
        });

      expect(res.status).toBe(201);
      expect(res.body.definition.id).toBe(sampleDefinition.id);
      expect(res.body.definition.name).toBe('avg_swap_size_usd');
      expect(createDefinition).toHaveBeenCalledTimes(1);
    });

    it('rejects unsupported source with 400 validation error', async () => {
      const app = buildApp({} as any);

      const res = await request(app)
        .post('/api/v1/metrics/definitions')
        .send({
          name: 'bad_metric',
          source: 'unknown_source',
          aggregation: 'count',
          window: '24h',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('rejects cyclic derived metric at save time', async () => {
      const createDefinition = jest.fn().mockRejectedValue(
        new MetricsError('CYCLE_DETECTED', 'Cycle detected in derived metric definition: a -> b -> a', 400)
      );
      const app = buildApp({ createDefinition } as any);

      const res = await request(app)
        .post('/api/v1/metrics/definitions')
        .send({
          name: 'cyclic_metric',
          source: 'transactions',
          aggregation: 'sum',
          window: '24h',
          formula: 'b + 10',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CYCLE_DETECTED');
    });
  });

  describe('GET /definitions', () => {
    it('returns list of definitions for authenticated user', async () => {
      const listDefinitions = jest.fn().mockResolvedValue([sampleDefinition]);
      const app = buildApp({ listDefinitions } as any);

      const res = await request(app).get('/api/v1/metrics/definitions');

      expect(res.status).toBe(200);
      expect(res.body.definitions).toHaveLength(1);
      expect(res.body.definitions[0].id).toBe(sampleDefinition.id);
    });
  });

  describe('GET /definitions/:id & Ownership Scoping', () => {
    it('returns 200 with definition when user owns it', async () => {
      const getDefinition = jest.fn().mockResolvedValue(sampleDefinition);
      const app = buildApp({ getDefinition } as any);

      const res = await request(app).get(`/api/v1/metrics/definitions/${sampleDefinition.id}`);

      expect(res.status).toBe(200);
      expect(res.body.definition.id).toBe(sampleDefinition.id);
    });

    it('returns 404 when user tries to access another user definition', async () => {
      currentUser = { userId: 'user-2', email: 'user2@example.com', permissions: [] };
      const getDefinition = jest.fn().mockRejectedValue(
        new MetricsError('METRIC_NOT_FOUND', 'Metric definition not found', 404)
      );
      const app = buildApp({ getDefinition } as any);

      const res = await request(app).get(`/api/v1/metrics/definitions/${sampleDefinition.id}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('METRIC_NOT_FOUND');
    });
  });

  describe('PATCH /definitions/:id', () => {
    it('updates definition fields', async () => {
      const updated = { ...sampleDefinition, target: 600 };
      const updateDefinition = jest.fn().mockResolvedValue(updated);
      const app = buildApp({ updateDefinition } as any);

      const res = await request(app)
        .patch(`/api/v1/metrics/definitions/${sampleDefinition.id}`)
        .send({ target: 600 });

      expect(res.status).toBe(200);
      expect(res.body.definition.target).toBe(600);
    });
  });

  describe('DELETE /definitions/:id', () => {
    it('deletes definition and returns 204', async () => {
      const deleteDefinition = jest.fn().mockResolvedValue(undefined);
      const app = buildApp({ deleteDefinition } as any);

      const res = await request(app).delete(`/api/v1/metrics/definitions/${sampleDefinition.id}`);

      expect(res.status).toBe(204);
      expect(deleteDefinition).toHaveBeenCalledWith(sampleDefinition.id, 'user-1');
    });
  });

  describe('GET /:id/value', () => {
    it('returns current value, target, delta, and trend with dimension filters', async () => {
      const getValue = jest.fn().mockResolvedValue(sampleValueResult);
      const app = buildApp({ getValue } as any);

      const res = await request(app)
        .get(`/api/v1/metrics/${sampleDefinition.id}/value?protocol=blend&asset=USDC`);

      expect(res.status).toBe(200);
      expect(res.body.currentValue).toBe(550.25);
      expect(res.body.target).toBe(500);
      expect(res.body.delta).toBe(70.25);
      expect(res.body.trend).toBe('improving');
      expect(res.body.targetMet).toBe(true);
      expect(getValue).toHaveBeenCalledWith(
        sampleDefinition.id,
        'user-1',
        expect.objectContaining({ protocol: 'blend', asset: 'USDC' })
      );
    });
  });

  describe('GET /:id/series', () => {
    it('returns time-series data with explicit bucket size', async () => {
      const mockSeries = {
        metricId: sampleDefinition.id,
        metricName: sampleDefinition.name,
        unit: 'USD',
        bucket: '1h',
        from: '2026-09-01T00:00:00Z',
        to: '2026-09-01T04:00:00Z',
        series: [
          { timestamp: '2026-09-01T00:00:00Z', value: 100 },
          { timestamp: '2026-09-01T01:00:00Z', value: 150 },
        ],
      };

      const getSeries = jest.fn().mockResolvedValue(mockSeries);
      const app = buildApp({ getSeries } as any);

      const res = await request(app)
        .get(`/api/v1/metrics/${sampleDefinition.id}/series?bucket=1h`);

      expect(res.status).toBe(200);
      expect(res.body.bucket).toBe('1h');
      expect(res.body.series).toHaveLength(2);
      expect(getSeries).toHaveBeenCalledWith(
        sampleDefinition.id,
        'user-1',
        expect.objectContaining({ bucket: '1h' })
      );
    });
  });

  describe('POST /preview', () => {
    it('evaluates unsaved definition without persisting', async () => {
      const preview = jest.fn().mockResolvedValue(sampleValueResult);
      const app = buildApp({ preview } as any);

      const res = await request(app)
        .post('/api/v1/metrics/preview')
        .send({
          source: 'transactions',
          aggregation: 'avg',
          targetField: 'amount',
          window: '24h',
          dimensions: ['protocol'],
          filters: [{ field: 'asset', operator: 'eq', value: 'USDC' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.currentValue).toBe(550.25);
      expect(preview).toHaveBeenCalledTimes(1);
    });
  });

  describe('Import / Export', () => {
    it('exports definitions as JSON', async () => {
      const exportDefinitions = jest.fn().mockResolvedValue({
        version: '1.0',
        exportedAt: '2026-09-01T12:00:00Z',
        definitions: [sampleDefinition],
      });
      const app = buildApp({ exportDefinitions } as any);

      const res = await request(app).get('/api/v1/metrics/definitions/export');

      expect(res.status).toBe(200);
      expect(res.body.version).toBe('1.0');
      expect(res.body.definitions).toHaveLength(1);
    });

    it('imports definitions from JSON payload', async () => {
      const importDefinitions = jest.fn().mockResolvedValue({
        importedCount: 1,
        imported: [sampleDefinition],
      });
      const app = buildApp({ importDefinitions } as any);

      const res = await request(app)
        .post('/api/v1/metrics/definitions/import')
        .send({
          definitions: [
            {
              name: 'imported_metric',
              source: 'transactions',
              aggregation: 'count',
              window: '24h',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.importedCount).toBe(1);
    });
  });

  describe('GET /dashboard', () => {
    it('returns high level KPI summary cards', async () => {
      const listDefinitions = jest.fn().mockResolvedValue([sampleDefinition]);
      const getValue = jest.fn().mockResolvedValue(sampleValueResult);
      const app = buildApp({ listDefinitions, getValue } as any);

      const res = await request(app).get('/api/v1/metrics/dashboard');

      expect(res.status).toBe(200);
      expect(res.body.totalDefinitions).toBe(1);
      expect(res.body.kpis).toHaveLength(1);
      expect(res.body.kpis[0].currentValue).toBe(550.25);
    });
  });
});
