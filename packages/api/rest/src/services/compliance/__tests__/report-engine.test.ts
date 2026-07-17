import { buildIdempotencyKey, ComplianceReportEngine } from '../report-engine';
import { ComplianceReportRecord } from '../../../types/compliance-types';

describe('buildIdempotencyKey', () => {
  it('is stable for the same inputs', () => {
    const input = {
      userId: 'user-1',
      reportType: 'transaction',
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
      redactPii: true,
      scheduleId: null as string | null,
    };
    const a = buildIdempotencyKey(input);
    const b = buildIdempotencyKey(input);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes when period or format changes', () => {
    const base = {
      userId: 'user-1',
      reportType: 'transaction',
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
      redactPii: true,
    };
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({ ...base, format: 'csv' });
    expect(a).not.toBe(b);
  });
});

describe('ComplianceReportEngine', () => {
  const completed: ComplianceReportRecord = {
    id: 'rep-1',
    userId: 'user-1',
    reportType: 'transaction',
    format: 'json',
    status: 'completed',
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-31T23:59:59.999Z'),
    scheduleId: null,
    idempotencyKey: 'abc',
    redactPii: true,
    rowCount: 1,
    content: '{"ok":true}',
    contentType: 'application/json',
    errorMessage: null,
    createdAt: new Date('2026-07-17T00:00:00.000Z'),
    completedAt: new Date('2026-07-17T00:00:01.000Z'),
  };

  it('returns existing completed report for identical requests (idempotent)', async () => {
    const auditLogger = {
      query: jest.fn(),
    };
    const repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(completed),
      createPending: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
    };

    const engine = new ComplianceReportEngine(auditLogger as never, repository as never);
    const result = await engine.generate('user-1', {
      reportType: 'transaction',
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
      redactPii: true,
    });

    expect(result.id).toBe('rep-1');
    expect(auditLogger.query).not.toHaveBeenCalled();
    expect(repository.createPending).not.toHaveBeenCalled();
  });

  it('generates and persists a new report from audit events', async () => {
    const auditLogger = {
      query: jest.fn().mockResolvedValue([
        {
          id: '1',
          timestamp: '2026-07-02T10:00:00.000Z',
          user_id: 'user-1',
          action: 'wallet.transfer',
          resource: '/tx',
          ip_address: '1.2.3.4',
          success: true,
          metadata: { amount: '1', txHash: 'h1' },
        },
      ]),
    };

    const pending: ComplianceReportRecord = {
      ...completed,
      id: 'rep-new',
      status: 'pending',
      content: null,
      contentType: null,
      completedAt: null,
      rowCount: 0,
    };

    const repository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createPending: jest.fn().mockResolvedValue(pending),
      markCompleted: jest.fn().mockImplementation(async (_id, _userId, update) => ({
        ...pending,
        status: 'completed',
        content: update.content,
        contentType: update.contentType,
        rowCount: update.rowCount,
        completedAt: new Date(),
      })),
      markFailed: jest.fn(),
    };

    const engine = new ComplianceReportEngine(auditLogger as never, repository as never);
    const result = await engine.generate('user-1', {
      reportType: 'transaction',
      format: 'csv',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
      redactPii: true,
    });

    expect(result.status).toBe('completed');
    expect(result.contentType).toBe('text/csv');
    expect(result.content).toContain('wallet.transfer');
    expect(repository.markCompleted).toHaveBeenCalledTimes(1);
  });

  it('lists the four built-in templates', () => {
    const engine = new ComplianceReportEngine(
      { query: jest.fn() } as never,
      {} as never
    );
    const templates = engine.listTemplates();
    expect(templates).toHaveLength(4);
    expect(templates.map((t) => t.type).sort()).toEqual(
      ['defi_activity', 'risk_exposure', 'transaction', 'user_activity'].sort()
    );
  });
});
