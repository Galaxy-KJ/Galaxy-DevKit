import { AuditLogger, sanitizeMetadata } from '../services/audit-logger';

const insertMock = jest.fn();
const orderMock = jest.fn();
const limitMock = jest.fn();
const selectMock = jest.fn();
const eqMock = jest.fn();
const gteMock = jest.fn();
const lteMock = jest.fn();
const ltMock = jest.fn();
const fromMock = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: fromMock,
  })),
}));

beforeEach(() => {
  insertMock.mockReset();
  orderMock.mockReset();
  limitMock.mockReset();
  selectMock.mockReset();
  eqMock.mockReset();
  gteMock.mockReset();
  lteMock.mockReset();
  ltMock.mockReset();
  fromMock.mockReset();

  const queryBuilder = {
    insert: insertMock.mockResolvedValue({ error: null }),
    select: selectMock.mockReturnThis(),
    eq: eqMock.mockReturnThis(),
    gte: gteMock.mockReturnThis(),
    lte: lteMock.mockReturnThis(),
    lt: ltMock.mockReturnThis(),
    order: orderMock.mockReturnThis(),
    limit: limitMock.mockResolvedValue({ data: [], error: null }),
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

    const page = await logger.query({ userId: 'user-1', action: 'auth.login', from, to });

    expect(fromMock).toHaveBeenCalledWith('audit_logs');
    expect(selectMock).toHaveBeenCalledWith('*');
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(eqMock).toHaveBeenCalledWith('action', 'auth.login');
    expect(gteMock).toHaveBeenCalledWith('timestamp', from.toISOString());
    expect(lteMock).toHaveBeenCalledWith('timestamp', to.toISOString());
    expect(orderMock).toHaveBeenCalledWith('timestamp', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(51); // default limit (50) + 1 lookahead row
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('bounds the page size and defaults to 50 rows', async () => {
    const logger = new AuditLogger();
    await logger.query({ limit: 500 });
    expect(limitMock).toHaveBeenCalledWith(201); // capped at 200 + 1 lookahead row
  });

  it('decodes an incoming cursor into a timestamp lower bound', async () => {
    const logger = new AuditLogger();
    const cursor = Buffer.from('2024-01-01T00:00:00.000Z', 'utf8').toString('base64url');

    await logger.query({ cursor });

    expect(ltMock).toHaveBeenCalledWith('timestamp', '2024-01-01T00:00:00.000Z');
  });

  it('returns a next cursor when more rows exist than the page size', async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        { timestamp: '2024-01-03T00:00:00.000Z' },
        { timestamp: '2024-01-02T00:00:00.000Z' },
      ],
      error: null,
    });

    const logger = new AuditLogger();
    const page = await logger.query({ limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });
});
