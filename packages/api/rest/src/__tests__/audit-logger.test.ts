import { AuditLogger, sanitizeMetadata } from '../services/audit-logger';

const insertMock = jest.fn();
const orderMock = jest.fn();
const selectMock = jest.fn();
const eqMock = jest.fn();
const gteMock = jest.fn();
const lteMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: fromMock,
  })),
}));

beforeEach(() => {
  insertMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  eqMock.mockReset();
  gteMock.mockReset();
  lteMock.mockReset();
  fromMock.mockReset();

  const queryBuilder = {
    insert: insertMock.mockResolvedValue({ error: null }),
    select: selectMock.mockReturnThis(),
    eq: eqMock.mockReturnThis(),
    gte: gteMock.mockReturnThis(),
    lte: lteMock.mockReturnThis(),
    order: orderMock.mockResolvedValue({ data: [], error: null }),
  };

  fromMock.mockReturnValue(queryBuilder);
});

describe('AuditLogger', () => {
  it('sanitizes sensitive fields in metadata', () => {
    const sanitized = sanitizeMetadata({
      password: 'secret',
      token: 'abc',
      privateKey: 'key',
      encrypted_private_key: 'encrypted',
      nested: {
        secret: 'hidden',
        ok: 'value',
      },
      list: [{ secret: 'hidden' }, { ok: true }],
    });

    expect(sanitized).toEqual({
      nested: { ok: 'value' },
      list: [{}, { ok: true }],
    });
  });

  it('logs sanitized audit entries', async () => {
    const logger = new AuditLogger();

    await logger.log({
      user_id: 'user-1',
      action: 'auth.login',
      resource: '/auth/login',
      ip_address: '127.0.0.1',
      success: true,
      metadata: {
        password: 'secret',
        ok: 'value',
      },
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0][0];
    expect(payload.metadata).toEqual({ ok: 'value' });
    expect(payload.action).toBe('auth.login');
  });

  it('filters audit queries by user and date range', async () => {
    const logger = new AuditLogger();
    const from = new Date('2024-01-01T00:00:00Z');
    const to = new Date('2024-01-02T00:00:00Z');

    await logger.query({ userId: 'user-1', action: 'auth.login', from, to });

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqMock).toHaveBeenCalledWith('action', 'auth.login');
    expect(gteMock).toHaveBeenCalledWith('timestamp', from.toISOString());
    expect(lteMock).toHaveBeenCalledWith('timestamp', to.toISOString());
    expect(orderMock).toHaveBeenCalledWith('timestamp', { ascending: false });
  });
});
