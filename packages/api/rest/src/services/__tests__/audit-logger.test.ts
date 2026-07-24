const mockInsert = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockGte = jest.fn();
const mockLte = jest.fn();
const mockLt = jest.fn();

function buildQueryChain() {
  const chain: Record<string, jest.Mock> = {};
  chain.eq = mockEq.mockReturnValue(chain);
  chain.gte = mockGte.mockReturnValue(chain);
  chain.lte = mockLte.mockReturnValue(chain);
  chain.lt = mockLt.mockReturnValue(chain);
  chain.order = mockOrder.mockReturnValue(chain);
  chain.limit = mockLimit;
  return chain;
}

const mockFrom = jest.fn((_table: string) => ({
  insert: mockInsert,
  select: mockSelect.mockReturnValue(buildQueryChain()),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockFrom })),
}));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import { AuditLogger } from '../audit-logger';

describe('AuditLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
    mockLimit.mockResolvedValue({ data: [], error: null });
  });

  describe('log', () => {
    it('writes the structured fields, defaulting severity to info', async () => {
      const logger = new AuditLogger();
      await logger.log({
        user_id: 'user-1',
        action: 'defi.blend.supply',
        resource: '/defi/blend/supply',
        ip_address: '1.2.3.4',
        success: true,
      });

      expect(mockFrom).toHaveBeenCalledWith('audit_logs');
      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: 'user-1',
          organization_id: null,
          action: 'defi.blend.supply',
          resource: '/defi/blend/supply',
          resource_id: null,
          success: true,
          severity: 'info',
          correlation_id: null,
        }),
      ]);
    });

    it('persists explicit severity, correlationId, organizationId and resourceId', async () => {
      const logger = new AuditLogger();
      await logger.log({
        user_id: 'user-1',
        organization_id: 'org-1',
        action: 'defi.blend.borrow',
        resource: '/defi/blend/borrow',
        resource_id: 'GABC',
        ip_address: null,
        success: false,
        severity: 'critical',
        correlation_id: 'req-42',
      });

      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          organization_id: 'org-1',
          resource_id: 'GABC',
          severity: 'critical',
          correlation_id: 'req-42',
        }),
      ]);
    });

    it('strips sensitive metadata keys before writing', async () => {
      const logger = new AuditLogger();
      await logger.log({
        user_id: 'user-1',
        action: 'auth.login',
        resource: null,
        ip_address: null,
        success: true,
        metadata: { password: 'shh', nested: { token: 'x', keep: 'y' } },
      });

      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({
          metadata: { nested: { keep: 'y' } },
        }),
      ]);
    });

    it('is fire-and-forget by default: swallows write failures', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('db down') });
      const logger = new AuditLogger();

      await expect(
        logger.log({ user_id: 'user-1', action: 'x', resource: null, ip_address: null, success: true })
      ).resolves.toBeUndefined();
    });

    it('rethrows write failures when { sync: true } is passed', async () => {
      mockInsert.mockResolvedValueOnce({ error: new Error('db down') });
      const logger = new AuditLogger();

      await expect(
        logger.log(
          { user_id: 'user-1', action: 'x', resource: null, ip_address: null, success: true },
          { sync: true }
        )
      ).rejects.toThrow('db down');
    });
  });

  describe('query', () => {
    it('applies the new structured filters (organizationId, severity, correlationId)', async () => {
      const logger = new AuditLogger();
      await logger.query({
        userId: 'user-1',
        organizationId: 'org-1',
        severity: 'critical',
        correlationId: 'req-42',
      });

      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(mockEq).toHaveBeenCalledWith('organization_id', 'org-1');
      expect(mockEq).toHaveBeenCalledWith('severity', 'critical');
      expect(mockEq).toHaveBeenCalledWith('correlation_id', 'req-42');
    });

    it('returns an empty page instead of throwing when the query fails', async () => {
      mockLimit.mockResolvedValueOnce({ data: null, error: new Error('boom') });
      const logger = new AuditLogger();
      const result = await logger.query({ userId: 'user-1' });
      expect(result).toEqual({ items: [], nextCursor: null });
    });
  });
});
