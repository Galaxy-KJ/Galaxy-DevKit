import { Request, Response, NextFunction } from 'express';
import { AuthErrorCode, UserInfo } from '../../types/auth-types';

const mockLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/audit-logger', () => ({
  AuditLogger: jest.fn().mockImplementation(() => ({
    log: mockLog,
  })),
}));

import { requireRole, Role } from '../rbac';

function buildRequest(user?: Partial<UserInfo>): Request {
  return {
    user: user as UserInfo | undefined,
    originalUrl: '/wallets/123/keys',
    ip: '127.0.0.1',
  } as unknown as Request;
}

function buildResponse(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireRole', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('calls next() when the user has one of the required roles', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'manager' });
    const res = buildResponse();

    requireRole(['manager', 'admin'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('matches roles case-insensitively', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'Operator' });
    const res = buildResponse();

    requireRole(['operator'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows admin role through regardless of the required roles', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'admin' });
    const res = buildResponse();

    requireRole(['auditor'])(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects with 403 when the role is insufficient', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'operator' });
    const res = buildResponse();

    requireRole(['admin', 'manager'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Insufficient role. Required one of: admin, manager',
        details: {
          requiredRoles: ['admin', 'manager'],
          userRole: 'operator',
        },
      },
    });
  });

  it('writes an audit log entry when access is denied', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'auditor' });
    const res = buildResponse();

    requireRole(['admin'])(req, res, next);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        action: 'rbac.access_denied',
        resource: '/wallets/123/keys',
        success: false,
        error_code: AuthErrorCode.INSUFFICIENT_PERMISSIONS,
      })
    );
  });

  it('rejects with 403 when the user has no role assigned', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [] });
    const res = buildResponse();

    requireRole(['operator'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects with 401 when there is no authenticated user', () => {
    const req = buildRequest(undefined);
    const res = buildResponse();

    requireRole(['operator'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: AuthErrorCode.MISSING_TOKEN,
        message: 'Authentication required',
        details: {},
      },
    });
  });

  it('returns 500 if an unexpected error is thrown while checking the role', () => {
    const req = {
      originalUrl: '/wallets/123/keys',
      ip: '127.0.0.1',
      get user() {
        throw new Error('boom');
      },
    } as unknown as Request;
    const res = buildResponse();

    requireRole(['manager'])(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: AuthErrorCode.INTERNAL_ERROR,
        message: 'Internal server error during role check',
        details: {},
      },
    });
  });

  it('falls back to null ip_address in the audit log when the request has no ip', () => {
    const req = buildRequest({ userId: 'u1', email: 'a@test.com', permissions: [], role: 'auditor' });
    (req as { ip?: string }).ip = undefined;
    const res = buildResponse();

    requireRole(['admin'])(req, res, next);

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: null })
    );
  });

  it('returns roles supported by the RBAC system', () => {
    expect(Role.ADMIN).toBe('admin');
    expect(Role.MANAGER).toBe('manager');
    expect(Role.OPERATOR).toBe('operator');
    expect(Role.AUDITOR).toBe('auditor');
  });
});
