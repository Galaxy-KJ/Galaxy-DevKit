import { exportCsv, exportJson, exportPdf, exportReport } from '../exporters';
import { GeneratedReportPayload } from '../../../types/compliance-types';

const samplePayload: GeneratedReportPayload = {
  reportType: 'transaction',
  generatedAt: '2026-07-17T12:00:00.000Z',
  period: {
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-07-31T23:59:59.999Z',
  },
  redactPii: true,
  rowCount: 2,
  rows: [
    {
      timestamp: '2026-07-02T10:00:00.000Z',
      action: 'wallet.transfer',
      amount: '10',
      success: true,
    },
    {
      timestamp: '2026-07-03T11:00:00.000Z',
      action: 'wallet.transfer',
      amount: '5',
      success: false,
    },
  ],
  summary: { matchedRows: 2, successCount: 1, failCount: 1 },
};

describe('compliance exporters', () => {
  it('exports JSON with payload fields', () => {
    const result = exportJson(samplePayload);
    expect(result.contentType).toBe('application/json');
    const parsed = JSON.parse(result.content);
    expect(parsed.reportType).toBe('transaction');
    expect(parsed.rowCount).toBe(2);
    expect(parsed.rows).toHaveLength(2);
  });

  it('exports CSV with header and rows', () => {
    const result = exportCsv(samplePayload);
    expect(result.contentType).toBe('text/csv');
    const lines = result.content.trim().split('\n');
    expect(lines[0]).toContain('timestamp');
    expect(lines).toHaveLength(3);
    expect(result.content).toContain('wallet.transfer');
  });

  it('exports empty CSV with period metadata when no rows', () => {
    const empty: GeneratedReportPayload = {
      ...samplePayload,
      rowCount: 0,
      rows: [],
    };
    const result = exportCsv(empty);
    expect(result.content).toContain('reportType,periodFrom,periodTo,rowCount');
    expect(result.content).toContain('transaction');
  });

  it('exports a valid minimal PDF document', () => {
    const result = exportPdf(samplePayload);
    expect(result.contentType).toBe('application/pdf');
    expect(result.content.startsWith('%PDF-1.4')).toBe(true);
    expect(result.content).toContain('%%EOF');
    expect(result.content).toContain('Galaxy DevKit Compliance Report');
  });

  it('dispatches by format', () => {
    expect(exportReport('json', samplePayload).contentType).toBe('application/json');
    expect(exportReport('csv', samplePayload).contentType).toBe('text/csv');
    expect(exportReport('pdf', samplePayload).contentType).toBe('application/pdf');
  });
});
