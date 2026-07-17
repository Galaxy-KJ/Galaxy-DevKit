import { redactReportRow, redactReportRows } from '../pii-redaction';

describe('pii redaction', () => {
  it('redacts emails and ip addresses', () => {
    const row = redactReportRow({
      email: 'alice@example.com',
      ipAddress: '203.0.113.45',
      note: 'contact bob@corp.io from 10.1.2.3',
      amount: 12,
      success: true,
    });

    expect(row.email).toBe('a***@example.com');
    expect(row.ipAddress).toBe('203.0.*.*');
    expect(String(row.note)).toContain('b***@corp.io');
    expect(String(row.note)).toContain('10.1.*.*');
    expect(row.amount).toBe(12);
    expect(row.success).toBe(true);
  });

  it('maps over arrays of rows', () => {
    const rows = redactReportRows([
      { ipAddress: '1.2.3.4' },
      { ipAddress: '5.6.7.8' },
    ]);
    expect(rows[0].ipAddress).toBe('1.2.*.*');
    expect(rows[1].ipAddress).toBe('5.6.*.*');
  });
});
