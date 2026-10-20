import { Request, Response } from 'express';
import { createRequireKYC } from '../kyc-middleware';
import { KYCStatusLookupError } from '../../services/kyc/kyc-service';
import { KYCStatus, KYCStatusRecord } from '../../types/kyc-types';

const record = (status: KYCStatus): KYCStatusRecord => ({
  id: 'r1',
  userId: 'user-1',
  provider: 'fake',
  status,
  riskScore: 10,
  lastVerifiedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
});

function run(
  getStatus: jest.Mock,
  user?: Record<string, unknown>
) {
  const mw = createRequireKYC({ getStatus });
  const req = { user } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn();
  return mw(req, res, next).then(() => ({ res, next, getStatus }));
}

const USER = { userId: 'user-1', email: 'a@b.c', permissions: [] };

describe('requireKYC', () => {
  it('returns 403 unverified when there is no row', async () => {
    const { res, next } = await run(jest.fn().mockResolvedValue(null), USER);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'KYC verification required',
      currentStatus: 'unverified',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each<KYCStatus>(['rejected', 'flagged', 'pending'])(
    'returns 403 for %s',
    async status => {
      const { res, next } = await run(
        jest.fn().mockResolvedValue(record(status)),
        USER
      );
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ currentStatus: status })
      );
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('calls next for approved', async () => {
    const { res, next } = await run(
      jest.fn().mockResolvedValue(record('approved')),
      USER
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the lookup errors', async () => {
    const { res, next } = await run(
      jest.fn().mockRejectedValue(new KYCStatusLookupError('db down')),
      USER
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'KYC status unavailable' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 without req.user', async () => {
    const { res, next, getStatus } = await run(jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(getStatus).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user has no userId', async () => {
    const { res, next } = await run(jest.fn(), { id: 'legacy', permissions: [] });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['admin', 'system'])('bypasses for role %s without a lookup', async role => {
    const { next, getStatus } = await run(jest.fn(), { ...USER, role });
    expect(next).toHaveBeenCalledTimes(1);
    expect(getStatus).not.toHaveBeenCalled();
  });
});
