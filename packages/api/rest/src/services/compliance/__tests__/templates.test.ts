import { buildReportPayload } from '../templates';
import { AuditEvent } from '../../audit-logger';

const baseEvents: AuditEvent[] = [
  {
    id: '1',
    timestamp: '2026-07-02T10:00:00.000Z',
    user_id: 'user-1',
    action: 'wallet.transfer',
    resource: '/api/v1/wallets/submit-tx',
    ip_address: '10.0.0.1',
    success: true,
    metadata: {
      amount: '12.5',
      asset: 'USDC',
      counterparty: 'GABC',
      txHash: 'hash1',
    },
  },
  {
    id: '2',
    timestamp: '2026-07-02T11:00:00.000Z',
    user_id: 'user-1',
    action: 'defi.swap',
    resource: '/api/v1/defi/swap',
    ip_address: '10.0.0.1',
    success: true,
    metadata: {
      protocol: 'soroswap',
      assetIn: 'XLM',
      assetOut: 'USDC',
      amount: '100',
    },
  },
  {
    id: '3',
    timestamp: '2026-07-02T12:00:00.000Z',
    user_id: 'user-1',
    action: 'auth.login',
    resource: '/api/v1/auth/login',
    ip_address: '203.0.113.10',
    success: true,
  },
  {
    id: '4',
    timestamp: '2026-07-02T13:00:00.000Z',
    user_id: 'user-1',
    action: 'monitoring.alert.triggered',
    resource: 'alert-1',
    ip_address: null,
    success: true,
    metadata: {
      protocol: 'blend',
      healthFactor: '0.9',
      account: 'GXYZ',
    },
  },
];

const period = {
  from: new Date('2026-07-01T00:00:00.000Z'),
  to: new Date('2026-07-31T23:59:59.999Z'),
};

describe('buildReportPayload', () => {
  it('builds transaction report rows', () => {
    const payload = buildReportPayload('transaction', baseEvents, period, true);
    expect(payload.reportType).toBe('transaction');
    expect(payload.rowCount).toBeGreaterThanOrEqual(1);
    expect(payload.rows.some((r) => r.action === 'wallet.transfer')).toBe(true);
    expect(payload.summary.matchedRows).toBe(payload.rowCount);
  });

  it('builds defi activity report rows', () => {
    const payload = buildReportPayload('defi_activity', baseEvents, period, true);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].protocol).toBe('soroswap');
  });

  it('builds user activity report rows', () => {
    const payload = buildReportPayload('user_activity', baseEvents, period, true);
    expect(payload.rows.some((r) => r.action === 'auth.login')).toBe(true);
  });

  it('builds risk exposure report with severity', () => {
    const payload = buildReportPayload('risk_exposure', baseEvents, period, true);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].severity).toBe('critical');
    expect(payload.summary.criticalCount).toBe(1);
  });

  it('returns empty rows when no events match', () => {
    const payload = buildReportPayload(
      'defi_activity',
      [baseEvents[2]],
      period,
      true
    );
    expect(payload.rowCount).toBe(0);
    expect(payload.rows).toEqual([]);
  });
});
