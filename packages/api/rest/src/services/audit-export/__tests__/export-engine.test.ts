import { AuditExportEngine } from '../export-engine';
import { AuditExportRecord } from '../../../types/audit-export-types';
import { buildHashChain } from '../hash-chain';

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('AuditExportEngine', () => {
  const pending: AuditExportRecord = {
    id: 'exp-1',
    userId: 'user-1',
    format: 'json',
    status: 'pending',
    periodStart: new Date('2026-07-01T00:00:00.000Z'),
    periodEnd: new Date('2026-07-20T00:00:00.000Z'),
    filterAction: null,
    filterResource: null,
    incremental: false,
    recordCount: 0,
    chainRootHash: null,
    content: null,
    contentType: null,
    errorMessage: null,
    createdAt: new Date('2026-07-21T00:00:00.000Z'),
    completedAt: null,
  };

  it('returns a pending record immediately and processes in the background', async () => {
    const auditLogger = {
      query: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const repository = {
      getLastExportedAt: jest.fn().mockResolvedValue(null),
      createPending: jest.fn().mockResolvedValue(pending),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      setLastExportedAt: jest.fn().mockResolvedValue(undefined),
    };

    const engine = new AuditExportEngine(auditLogger as never, repository as never);
    const result = await engine.startExport('user-1', {
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-20T00:00:00.000Z'),
    });

    expect(result.status).toBe('pending');
    expect(repository.createPending).toHaveBeenCalledTimes(1);

    await flushAsync();

    expect(repository.markProcessing).toHaveBeenCalledWith('exp-1');
    expect(repository.markCompleted).toHaveBeenCalledTimes(1);
    expect(repository.setLastExportedAt).toHaveBeenCalledWith(
      'user-1',
      new Date('2026-07-20T00:00:00.000Z')
    );
  });

  it('widens `from` to the last export cursor for incremental exports', async () => {
    const lastExportedAt = new Date('2026-07-15T00:00:00.000Z');
    const auditLogger = { query: jest.fn().mockResolvedValue({ items: [], nextCursor: null }) };
    const repository = {
      getLastExportedAt: jest.fn().mockResolvedValue(lastExportedAt),
      createPending: jest.fn().mockResolvedValue(pending),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      setLastExportedAt: jest.fn().mockResolvedValue(undefined),
    };

    const engine = new AuditExportEngine(auditLogger as never, repository as never);
    await engine.startExport('user-1', {
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-20T00:00:00.000Z'),
      incremental: true,
    });

    expect(repository.createPending).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: lastExportedAt })
    );
  });

  it('marks the export failed if audit log query throws', async () => {
    const auditLogger = { query: jest.fn().mockRejectedValue(new Error('db down')) };
    const repository = {
      getLastExportedAt: jest.fn().mockResolvedValue(null),
      createPending: jest.fn().mockResolvedValue(pending),
      markProcessing: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      setLastExportedAt: jest.fn().mockResolvedValue(undefined),
    };

    const engine = new AuditExportEngine(auditLogger as never, repository as never);
    await engine.startExport('user-1', {
      format: 'json',
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-20T00:00:00.000Z'),
    });

    await flushAsync();

    expect(repository.markFailed).toHaveBeenCalledWith('exp-1', 'db down');
    expect(repository.markCompleted).not.toHaveBeenCalled();
  });

  it('verifies a completed export by recomputing the hash chain', async () => {
    const events = [
      {
        id: '1',
        timestamp: '2026-07-02T10:00:00.000Z',
        user_id: 'user-1',
        action: 'wallet.transfer',
        resource: '/tx',
        ip_address: '1.2.3.4',
        success: true,
      },
    ];
    const { entries, rootHash } = buildHashChain(events);

    const completed: AuditExportRecord = {
      ...pending,
      status: 'completed',
      chainRootHash: rootHash,
      content: JSON.stringify({ manifest: {}, entries }),
      contentType: 'application/json',
      recordCount: 1,
      completedAt: new Date(),
    };

    const repository = { getForUser: jest.fn().mockResolvedValue(completed) };
    const engine = new AuditExportEngine({} as never, repository as never);

    const result = await engine.verifyExport('user-1', 'exp-1');
    expect(result.valid).toBe(true);
  });

  it('detects tampering during verification', async () => {
    const events = [
      {
        id: '1',
        timestamp: '2026-07-02T10:00:00.000Z',
        user_id: 'user-1',
        action: 'wallet.transfer',
        resource: '/tx',
        ip_address: '1.2.3.4',
        success: true,
      },
    ];
    const { entries, rootHash } = buildHashChain(events);
    const tamperedEntries = [{ ...entries[0], action: 'wallet.withdraw' }];

    const completed: AuditExportRecord = {
      ...pending,
      status: 'completed',
      chainRootHash: rootHash,
      content: JSON.stringify({ manifest: {}, entries: tamperedEntries }),
      contentType: 'application/json',
      recordCount: 1,
      completedAt: new Date(),
    };

    const repository = { getForUser: jest.fn().mockResolvedValue(completed) };
    const engine = new AuditExportEngine({} as never, repository as never);

    const result = await engine.verifyExport('user-1', 'exp-1');
    expect(result.valid).toBe(false);
  });
});
