import express from 'express';
import request from 'supertest';
import { SupabaseClient } from '@supabase/supabase-js';
import { setupKycRoutes } from '../kyc-routes';
import { createRequireKYC } from '../../middleware/kyc-middleware';
import {
  KYCService,
  KYCStatusLookupError,
  KYCStatusPersistError,
} from '../../services/kyc/kyc-service';
import { IKYCProvider } from '../../types/kyc-types';

let currentUser: Record<string, unknown> | undefined;

const USER_ID = '22222222-2222-2222-2222-222222222222';

function makeRow(status: string) {
  return {
    id: 'row-1',
    user_id: USER_ID,
    provider: 'fake',
    status,
    risk_score: 10,
    last_verified_at: '2026-07-19T10:00:00.000Z',
    created_at: '2026-07-19T09:00:00.000Z',
    updated_at: '2026-07-19T10:00:00.000Z',
  };
}

/** In-memory kyc_status table behind a Supabase-shaped client. */
function makeStore(initial?: ReturnType<typeof makeRow>) {
  let stored = initial ?? null;
  const upsert = jest.fn((values: Record<string, unknown>) => {
    stored = { ...makeRow(String(values.status)), ...values } as ReturnType<
      typeof makeRow
    >;
    return chain;
  });
  const chain: Record<string, unknown> = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    upsert,
    maybeSingle: jest.fn(() => Promise.resolve({ data: stored, error: null })),
    single: jest.fn(() => Promise.resolve({ data: stored, error: null })),
  };
  const client = { from: jest.fn(() => chain) } as unknown as SupabaseClient;
  return { client, upsert };
}

function makeProvider(sanctioned = false): IKYCProvider {
  return {
    name: 'fake',
    verifyIdentity: jest.fn().mockResolvedValue({
      status: 'approved',
      riskScore: 10,
      provider: 'fake',
      verifiedAt: new Date('2026-07-19T10:00:00.000Z'),
    }),
    checkSanctions: jest.fn().mockResolvedValue(sanctioned),
    getRiskScore: jest.fn().mockResolvedValue(10),
  };
}

function buildApp(service: KYCService) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (currentUser) req.user = currentUser as never;
    next();
  });
  app.use('/kyc', setupKycRoutes(service));
  app.get('/protected', createRequireKYC(service), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

beforeEach(() => {
  currentUser = { userId: USER_ID, email: 'u@t.io', permissions: [] };
});

describe('KYC routes with requireKYC', () => {
  it('denies a user with no kyc_status row', async () => {
    const { client } = makeStore();
    const app = buildApp(new KYCService({ client, provider: makeProvider() }));

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.currentStatus).toBe('unverified');
  });

  it('opens the gate after POST /kyc/verify approves and persists', async () => {
    const { client, upsert } = makeStore();
    const app = buildApp(new KYCService({ client, provider: makeProvider() }));

    const verify = await request(app)
      .post('/kyc/verify')
      .send({ documentData: { type: 'passport' } });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('approved');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: USER_ID, status: 'approved' }),
      { onConflict: 'user_id' }
    );

    const protectedRes = await request(app).get('/protected');
    expect(protectedRes.status).toBe(200);
  });

  it('denies a flagged user', async () => {
    const { client } = makeStore(makeRow('flagged'));
    const app = buildApp(new KYCService({ client, provider: makeProvider() }));

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
    expect(res.body.currentStatus).toBe('flagged');
  });

  it('does not let a flagged user re-verify into approved', async () => {
    const { client, upsert } = makeStore(makeRow('flagged'));
    const app = buildApp(new KYCService({ client, provider: makeProvider() }));

    const verify = await request(app)
      .post('/kyc/verify')
      .send({ documentData: { type: 'passport' } });
    expect(verify.status).toBe(200);
    expect(verify.body.status).toBe('flagged');
    expect(upsert).not.toHaveBeenCalled();

    expect((await request(app).get('/protected')).status).toBe(403);
  });

  it('returns 503 from GET /kyc/status on a store error', async () => {
    const service = {
      getStatus: jest.fn().mockRejectedValue(new KYCStatusLookupError('down')),
    } as unknown as KYCService;
    const app = buildApp(service);

    const res = await request(app).get('/kyc/status');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'KYC status unavailable' });
  });

  it('returns 503 from POST /kyc/verify when the upsert is rejected', async () => {
    const service = {
      verifyUser: jest
        .fn()
        .mockRejectedValue(new KYCStatusPersistError('trigger blocked')),
    } as unknown as KYCService;
    const app = buildApp(service);

    const res = await request(app).post('/kyc/verify').send({ documentData: {} });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'KYC status unavailable' });
  });

  it('flags a sanctioned user and then denies the gate', async () => {
    const { client } = makeStore(makeRow('approved'));
    const app = buildApp(
      new KYCService({ client, provider: makeProvider(true) })
    );

    const check = await request(app)
      .post('/kyc/sanctions-check')
      .send({ walletAddress: '0xBAD' });
    expect(check.status).toBe(200);
    expect(check.body).toEqual({ isSanctioned: true });

    const res = await request(app).get('/protected');
    expect(res.status).toBe(403);
  });

  it('returns 401 from the routes when req.user has no userId', async () => {
    currentUser = { id: 'legacy', permissions: [] };
    const { client } = makeStore();
    const app = buildApp(new KYCService({ client, provider: makeProvider() }));

    expect((await request(app).get('/kyc/status')).status).toBe(401);
    expect((await request(app).post('/kyc/verify').send({})).status).toBe(401);
    expect((await request(app).get('/protected')).status).toBe(401);
  });
});
