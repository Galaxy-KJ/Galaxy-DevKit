import { SupabaseClient } from '@supabase/supabase-js';
import {
  KYCService,
  KYCStatusLookupError,
  KYCStatusPersistError,
} from '../kyc-service';
import { IKYCProvider } from '../../../types/kyc-types';

function makeClient(
  responses: Array<{ data?: unknown; error?: unknown }>
) {
  const queue = [...responses];
  const next = () => queue.shift() ?? { data: null, error: null };
  const chain = {
    select: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => Promise.resolve(next())),
    maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(next())),
  };
  const client = {
    from: jest.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;
  return { client, chain };
}

const USER_ID = '22222222-2222-2222-2222-222222222222';
const VERIFIED_AT = new Date('2026-07-19T10:00:00.000Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  user_id: USER_ID,
  provider: 'fake',
  status: 'approved',
  risk_score: 10,
  last_verified_at: VERIFIED_AT.toISOString(),
  created_at: '2026-07-19T09:00:00.000Z',
  updated_at: '2026-07-19T10:00:00.000Z',
  ...over,
});

function makeProvider(over: Partial<IKYCProvider> = {}): IKYCProvider {
  return {
    name: 'fake',
    verifyIdentity: jest.fn().mockResolvedValue({
      status: 'approved',
      riskScore: 10,
      provider: 'fake',
      verifiedAt: VERIFIED_AT,
    }),
    checkSanctions: jest.fn().mockResolvedValue(false),
    getRiskScore: jest.fn().mockResolvedValue(10),
    ...over,
  };
}

describe('KYCService', () => {
  describe('getStatus', () => {
    it('returns null when no row exists', async () => {
      const { client, chain } = makeClient([{ data: null, error: null }]);
      const svc = new KYCService({ client, provider: makeProvider() });

      await expect(svc.getStatus(USER_ID)).resolves.toBeNull();
      expect(client.from).toHaveBeenCalledWith('kyc_status');
      expect(chain.eq).toHaveBeenCalledWith('user_id', USER_ID);
    });

    it('maps a row to a record with Date fields', async () => {
      const { client } = makeClient([{ data: row(), error: null }]);
      const svc = new KYCService({ client, provider: makeProvider() });

      const record = await svc.getStatus(USER_ID);
      expect(record).toEqual({
        id: 'row-1',
        userId: USER_ID,
        provider: 'fake',
        status: 'approved',
        riskScore: 10,
        lastVerifiedAt: VERIFIED_AT,
        createdAt: new Date('2026-07-19T09:00:00.000Z'),
        updatedAt: new Date('2026-07-19T10:00:00.000Z'),
      });
      expect(record!.createdAt).toBeInstanceOf(Date);
    });

    it('throws KYCStatusLookupError on a database error', async () => {
      const { client } = makeClient([{ data: null, error: { message: 'boom' } }]);
      const svc = new KYCService({ client, provider: makeProvider() });

      await expect(svc.getStatus(USER_ID)).rejects.toBeInstanceOf(
        KYCStatusLookupError
      );
    });
  });

  describe('verifyUser', () => {
    it('upserts the provider result and returns the persisted row', async () => {
      const { client, chain } = makeClient([
        { data: null, error: null },
        { data: row(), error: null },
      ]);
      const svc = new KYCService({ client, provider: makeProvider() });

      const record = await svc.verifyUser(USER_ID, { doc: 1 });

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: USER_ID,
          provider: 'fake',
          status: 'approved',
          risk_score: 10,
          last_verified_at: VERIFIED_AT.toISOString(),
        }),
        { onConflict: 'user_id' }
      );
      expect(chain.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        chain.select.mock.invocationCallOrder.slice(-1)[0]
      );
      expect(chain.single).toHaveBeenCalledTimes(1);
      expect(record.status).toBe('approved');
      expect(record.id).toBe('row-1');
    });

    it('keeps a flagged user flagged and skips the provider', async () => {
      const { client, chain } = makeClient([
        { data: row({ status: 'flagged' }), error: null },
      ]);
      const provider = makeProvider();
      const svc = new KYCService({ client, provider });

      const record = await svc.verifyUser(USER_ID, { doc: 1 });

      expect(record.status).toBe('flagged');
      expect(provider.verifyIdentity).not.toHaveBeenCalled();
      expect(chain.upsert).not.toHaveBeenCalled();
    });

    it('throws when the upsert fails', async () => {
      const { client } = makeClient([
        { data: null, error: null },
        { data: null, error: { message: 'nope' } },
      ]);
      const svc = new KYCService({ client, provider: makeProvider() });

      const p = svc.verifyUser(USER_ID, {});
      await expect(p).rejects.toBeInstanceOf(KYCStatusPersistError);
      await expect(p).rejects.toThrow(/Failed to persist KYC status/);
    });
  });

  describe('checkSanctions', () => {
    it('writes flagged and reports sanctioned when the provider flags the user', async () => {
      const { client, chain } = makeClient([
        { data: row({ status: 'flagged' }), error: null },
      ]);
      const provider = makeProvider({
        checkSanctions: jest.fn().mockResolvedValue(true),
      });
      const svc = new KYCService({ client, provider });

      const result = await svc.checkSanctions(USER_ID, '0xBAD');

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: USER_ID, status: 'flagged' }),
        { onConflict: 'user_id' }
      );
      expect(result.sanctioned).toBe(true);
      expect(result.record?.status).toBe('flagged');
    });

    it('does not write when the user is not sanctioned', async () => {
      const { client, chain } = makeClient([{ data: row(), error: null }]);
      const svc = new KYCService({ client, provider: makeProvider() });

      const result = await svc.checkSanctions(USER_ID);

      expect(chain.upsert).not.toHaveBeenCalled();
      expect(result.sanctioned).toBe(false);
      expect(result.record?.status).toBe('approved');
    });
  });
});
