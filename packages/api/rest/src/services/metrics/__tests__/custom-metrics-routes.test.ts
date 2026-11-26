import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { setupCustomMetricsRoutes } from '../../../routes/custom-metrics';
import { CustomMetricsService } from '../custom-metrics.service';
import { MetricsError } from '../../../types/custom-metrics';
jest.mock('../../../middleware/auth', () => ({ authenticate: () => (req: Request, _res: Response, next: NextFunction) => { if (req.headers.authorization) req.user = { userId: 'alice' } as Request['user']; next(); } }));
jest.mock('../../../middleware/audit', () => ({ auditRequest: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
const id = '11111111-1111-4111-8111-111111111111';
function app() {
  const service = { list: jest.fn().mockResolvedValue([]), preview: jest.fn().mockResolvedValue({ groups: [] }), value: jest.fn().mockResolvedValue({ groups: [] }), save: jest.fn(), series: jest.fn(), import: jest.fn() };
  const app = express(); app.use(express.json()); app.use('/metrics', setupCustomMetricsRoutes(service as unknown as CustomMetricsService));
  return { app, service };
}
test.each(['/definitions', `/${id}/value`, '/export'])('rejects unauthenticated %s', async path => {
  const harness = app();
  expect((await request(harness.app).get(`/metrics${path}`)).status).toBe(401);
  expect(harness.service.list).not.toHaveBeenCalled();
});
test('uses authenticated identity, never a body owner', async () => {
  const harness = app();
  await request(harness.app).post('/metrics/preview').set('Authorization', 'Bearer test').send({ userId: 'bob' }).expect(200);
  expect(harness.service.preview).toHaveBeenCalledWith('alice', { userId: 'bob' });
});
test('forwards dimension filters and rejects array/object query values', async () => {
  const harness = app();
  await request(harness.app).get(`/metrics/${id}/value?asset=XLM`).set('Authorization', 'Bearer test').expect(200);
  expect(harness.service.value).toHaveBeenCalledWith('alice', id, { asset: 'XLM' });
  await request(harness.app).get(`/metrics/${id}/value?asset[]=XLM`).set('Authorization', 'Bearer test').expect(400);
});
test('requires explicit series buckets and reports service errors', async () => {
  const harness = app();
  await request(harness.app).get(`/metrics/${id}/series`).set('Authorization', 'Bearer test').expect(400);
  harness.service.value.mockRejectedValue(new MetricsError(422, 'METRIC_COST_LIMIT', 'Too many rows'));
  const response = await request(harness.app).get(`/metrics/${id}/value`).set('Authorization', 'Bearer test').expect(422);
  expect(response.body.error.code).toBe('METRIC_COST_LIMIT');
});
