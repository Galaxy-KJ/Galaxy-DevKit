import express from 'express';
import request from 'supertest';
import { setupMonitoringRoutes } from '../alerts';
import { MonitoringAlertService } from '../../../services/monitoring/monitoring-alert.service';
import {
  MonitoringAlert,
  MonitoringError,
  MonitoringErrorCode,
} from '../../../types/monitoring-types';

// Bypass the real JWT middleware: the route under test does not exercise auth.
jest.mock('../../../middleware/auth', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', email: 't@t.io', permissions: [] };
    next();
  },
}));

jest.mock('../../../middleware/audit', () => ({
  auditRequest: () => (_req: any, _res: any, next: any) => next(),
}));

function buildApp(service: Partial<jest.Mocked<MonitoringAlertService>>) {
  const app = express();
  app.use(express.json());
  app.use('/monitoring', setupMonitoringRoutes(service as MonitoringAlertService));
  return app;
}

const sampleAlert: MonitoringAlert = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: 'user-1',
  name: 'Blend HF guard',
  protocol: 'blend',
  accountAddress: 'GA' + 'A'.repeat(54),
  network: 'testnet',
  alertType: 'health_factor_below',
  threshold: 1.5,
  channel: 'webhook',
  channelConfig: { url: 'https://hook.example.com', secret: 'sixteenchars1234' },
  cooldownSeconds: 300,
  status: 'active',
  lastTriggeredAt: null,
  lastEvaluatedAt: null,
  lastHealthFactor: null,
  metadata: {},
  createdAt: new Date('2026-06-29T00:00:00Z'),
  updatedAt: new Date('2026-06-29T00:00:00Z'),
};

describe('Monitoring alerts routes', () => {
  describe('POST /monitoring/alerts', () => {
    it('returns 201 with the created alert', async () => {
      const create = jest.fn().mockResolvedValue(sampleAlert);
      const app = buildApp({ create } as any);

      const response = await request(app)
        .post('/monitoring/alerts')
        .send({
          name: 'Blend HF guard',
          protocol: 'blend',
          accountAddress: sampleAlert.accountAddress,
          alertType: 'health_factor_below',
          threshold: 1.5,
          channel: 'webhook',
          channelConfig: { url: 'https://hook.example.com', secret: 'sixteenchars1234' },
        });

      expect(response.status).toBe(201);
      expect(response.body.alert.id).toBe(sampleAlert.id);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when required fields are missing', async () => {
      const app = buildApp({ create: jest.fn() } as any);

      const response = await request(app)
        .post('/monitoring/alerts')
        .send({ name: 'missing rest' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when accountAddress is not a Stellar G-address', async () => {
      const app = buildApp({ create: jest.fn() } as any);

      const response = await request(app)
        .post('/monitoring/alerts')
        .send({
          name: 'bad',
          protocol: 'blend',
          accountAddress: 'not-an-address',
          alertType: 'health_factor_below',
          threshold: 1.5,
          channel: 'webhook',
          channelConfig: { url: 'https://hook.example.com', secret: 'sixteenchars1234' },
        });

      expect(response.status).toBe(400);
    });

    it('returns 400 when webhook URL is not https in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      jest.resetModules();
      // Re-import the routes with the production-mode validator picked up.
      const { setupMonitoringRoutes: setupProd } = await import('../alerts');
      const app = express();
      app.use(express.json());
      app.use('/monitoring', setupProd({ create: jest.fn() } as any));

      const response = await request(app)
        .post('/monitoring/alerts')
        .send({
          name: 'bad',
          protocol: 'blend',
          accountAddress: sampleAlert.accountAddress,
          alertType: 'health_factor_below',
          threshold: 1.5,
          channel: 'webhook',
          channelConfig: { url: 'http://insecure.example.com', secret: 'sixteenchars1234' },
        });

      expect(response.status).toBe(400);
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('GET /monitoring/alerts', () => {
    it('returns the list scoped to the authenticated user', async () => {
      const list = jest.fn().mockResolvedValue([sampleAlert]);
      const app = buildApp({ list } as any);

      const response = await request(app).get('/monitoring/alerts');

      expect(response.status).toBe(200);
      expect(response.body.alerts).toHaveLength(1);
      expect(list.mock.calls[0][0].userId).toBe('user-1');
    });
  });

  describe('GET /monitoring/alerts/:id', () => {
    it('returns 200 with the alert', async () => {
      const getForUser = jest.fn().mockResolvedValue(sampleAlert);
      const app = buildApp({ getForUser } as any);

      const response = await request(app).get(`/monitoring/alerts/${sampleAlert.id}`);

      expect(response.status).toBe(200);
      expect(response.body.alert.id).toBe(sampleAlert.id);
    });

    it('returns 404 when service throws ALERT_NOT_FOUND', async () => {
      const getForUser = jest.fn().mockRejectedValue(
        new MonitoringError(MonitoringErrorCode.ALERT_NOT_FOUND, 'Monitoring alert not found', 404)
      );
      const app = buildApp({ getForUser } as any);

      const response = await request(app).get(`/monitoring/alerts/${sampleAlert.id}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ALERT_NOT_FOUND');
    });
  });

  describe('PATCH /monitoring/alerts/:id', () => {
    it('updates a subset of fields', async () => {
      const update = jest.fn().mockResolvedValue({ ...sampleAlert, threshold: 1.2 });
      const app = buildApp({ update } as any);

      const response = await request(app)
        .patch(`/monitoring/alerts/${sampleAlert.id}`)
        .send({ threshold: 1.2 });

      expect(response.status).toBe(200);
      expect(response.body.alert.threshold).toBe(1.2);
    });

    it('returns 400 when no fields are provided', async () => {
      const app = buildApp({ update: jest.fn() } as any);

      const response = await request(app)
        .patch(`/monitoring/alerts/${sampleAlert.id}`)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /monitoring/alerts/:id', () => {
    it('returns 204 on success', async () => {
      const del = jest.fn().mockResolvedValue(undefined);
      const app = buildApp({ delete: del } as any);

      const response = await request(app).delete(`/monitoring/alerts/${sampleAlert.id}`);

      expect(response.status).toBe(204);
    });
  });

  describe('GET /monitoring/alerts/:id/events', () => {
    it('returns the events array', async () => {
      const listEventsForUser = jest.fn().mockResolvedValue([]);
      const app = buildApp({ listEventsForUser } as any);

      const response = await request(app).get(`/monitoring/alerts/${sampleAlert.id}/events`);

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual([]);
    });
  });
});
