import { Request, Response, NextFunction } from 'express';
import {
  extractApiKey,
  isQueryApiKeyAllowed,
  rejectQueryApiKey,
  apiKeyMiddleware,
  requireApiKey,
} from '../api-key';
import { AuthErrorCode } from '../../types/auth-types';

const mockValidateApiKey = jest.fn();

jest.mock('../../services/auth-service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    // Read the mock at call time: jest.mock is hoisted above this const,
    // and api-key.ts runs `new AuthService()` at module scope, so reading
    // the variable here would hit the temporal dead zone.
    validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
  })),
}));

const VALID_KEY = 'gk_test_abcdefghijklmnopqrstuvwxyz0123456789';
const USER = { userId: 'u1', email: 'a@test.com', permissions: [] };
const API_KEY = {
  id: 'key-1',
  userId: 'u1',
  keyPrefix: 'gk_test',
  name: 'test',
  scopes: ['*'],
  rateLimit: 1000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  metadata: {},
};

function buildRequest(opts: {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
}): Request {
  return {
    headers: opts.headers ?? {},
    query: opts.query ?? {},
  } as unknown as Request;
}

function buildResponse(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('extractApiKey', () => {
  const OLD_NODE_ENV = process.env.NODE_ENV;
  const OLD_FLAG = process.env.API_KEY_ALLOW_QUERY;

  beforeEach(() => {
    delete process.env.API_KEY_ALLOW_QUERY;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = OLD_NODE_ENV;
    if (OLD_FLAG === undefined) {
      delete process.env.API_KEY_ALLOW_QUERY;
    } else {
      process.env.API_KEY_ALLOW_QUERY = OLD_FLAG;
    }
  });

  it('returns the key from the x-api-key header', () => {
    const req = buildRequest({ headers: { 'x-api-key': VALID_KEY } });
    expect(extractApiKey(req)).toBe(VALID_KEY);
  });

  it('returns the key from Authorization: Bearer', () => {
    const req = buildRequest({
      headers: { authorization: `Bearer ${VALID_KEY}` },
    });
    expect(extractApiKey(req)).toBe(VALID_KEY);
  });

  it('does not treat a JWT as an API key', () => {
    const req = buildRequest({
      headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature' },
    });
    expect(extractApiKey(req)).toBeNull();
  });

  it('does NOT accept a key from the ?api_key= query string by default', () => {
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    expect(extractApiKey(req)).toBeNull();
  });

  it('prefers the header when both header and query carry a key', () => {
    const req = buildRequest({
      headers: { 'x-api-key': VALID_KEY },
      query: { api_key: 'other-key-from-query' },
    });
    expect(extractApiKey(req)).toBe(VALID_KEY);
  });

  it('accepts the query key only with the transition flag outside production', () => {
    process.env.API_KEY_ALLOW_QUERY = 'true';
    expect(isQueryApiKeyAllowed()).toBe(true);
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    expect(extractApiKey(req)).toBe(VALID_KEY);
  });

  it('refuses the query key in production even with the transition flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY_ALLOW_QUERY = 'true';
    expect(isQueryApiKeyAllowed()).toBe(false);
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    expect(extractApiKey(req)).toBeNull();
  });
});

describe('rejectQueryApiKey', () => {
  beforeEach(() => {
    delete process.env.API_KEY_ALLOW_QUERY;
    process.env.NODE_ENV = 'test';
  });

  it('does nothing when there is no api_key query parameter', () => {
    const req = buildRequest({ query: { page: '2' } });
    const res = buildResponse();
    expect(rejectQueryApiKey(req, res)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 400 pointing at the x-api-key header when a query key is present', () => {
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    const res = buildResponse();
    expect(rejectQueryApiKey(req, res)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.code).toBe(AuthErrorCode.INVALID_API_KEY);
    expect(body.error.message).toContain('x-api-key');
    expect(body.error.message).toContain('?api_key=');
  });

  it('does not reject when the transition flag allows query keys', () => {
    process.env.API_KEY_ALLOW_QUERY = 'true';
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    const res = buildResponse();
    expect(rejectQueryApiKey(req, res)).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireApiKey', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.API_KEY_ALLOW_QUERY;
    process.env.NODE_ENV = 'test';
    next = jest.fn();
    mockValidateApiKey.mockResolvedValue({
      valid: true,
      apiKey: API_KEY,
      user: USER,
    });
  });

  it('returns 400 and never validates a key sent via ?api_key=', async () => {
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    const res = buildResponse();

    await requireApiKey()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates a valid key from the x-api-key header', async () => {
    const req = buildRequest({ headers: { 'x-api-key': VALID_KEY } });
    const res = buildResponse();

    await requireApiKey()(req, res, next);

    expect(mockValidateApiKey).toHaveBeenCalledWith(VALID_KEY);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when no key is provided at all', async () => {
    const req = buildRequest({});
    const res = buildResponse();

    await requireApiKey()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid header key', async () => {
    mockValidateApiKey.mockResolvedValue({ valid: false, error: 'Invalid API key' });
    const req = buildRequest({ headers: { 'x-api-key': 'bad-key' } });
    const res = buildResponse();

    await requireApiKey()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('apiKeyMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.API_KEY_ALLOW_QUERY;
    process.env.NODE_ENV = 'test';
    next = jest.fn();
    mockValidateApiKey.mockResolvedValue({
      valid: true,
      apiKey: API_KEY,
      user: USER,
    });
  });

  it('returns 400 and never validates a key sent via ?api_key=', async () => {
    const req = buildRequest({ query: { api_key: VALID_KEY } });
    const res = buildResponse();

    await apiKeyMiddleware()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockValidateApiKey).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('continues without a key when none is provided (optional auth)', async () => {
    const req = buildRequest({});
    const res = buildResponse();

    await apiKeyMiddleware()(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockValidateApiKey).not.toHaveBeenCalled();
  });

  it('attaches the user for a valid header key', async () => {
    const req = buildRequest({ headers: { 'x-api-key': VALID_KEY } });
    const res = buildResponse();

    await apiKeyMiddleware()(req, res, next);

    expect(mockValidateApiKey).toHaveBeenCalledWith(VALID_KEY);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(USER);
    expect(req.authMethod).toBe('api_key');
  });
});
