import { AuditEvent } from '../../audit-logger';
import { buildHashChain } from '../hash-chain';
import { exportAuditTrail } from '../exporters';
import { readZipArchive } from '../zip-writer';
import { ExportedManifest } from '../../../types/audit-export-types';

function makeManifest(overrides: Partial<ExportedManifest> = {}): ExportedManifest {
  return {
    format: 'json',
    generatedAt: '2026-07-21T00:00:00.000Z',
    period: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-20T00:00:00.000Z' },
    filters: {},
    recordCount: 1,
    chainRootHash: 'abc',
    ...overrides,
  };
}

describe('exportAuditTrail', () => {
  const events: AuditEvent[] = [
    {
      id: '1',
      timestamp: '2026-07-02T10:00:00.000Z',
      user_id: 'user-1',
      action: 'wallet.transfer',
      resource: '/tx',
      ip_address: '1.2.3.4',
      success: true,
      metadata: { amount: '10' },
    },
  ];
  const { entries, rootHash } = buildHashChain(events);
  const manifest = makeManifest({ chainRootHash: rootHash, recordCount: entries.length });

  it('exports JSON with manifest and hash-chained entries', () => {
    const result = exportAuditTrail('json', manifest, entries);
    expect(result.contentType).toBe('application/json');
    const parsed = JSON.parse(result.content);
    expect(parsed.manifest.chainRootHash).toBe(rootHash);
    expect(parsed.entries[0].hash).toBe(entries[0].hash);
  });

  it('exports CSV with hash columns', () => {
    const result = exportAuditTrail('csv', manifest, entries);
    expect(result.contentType).toBe('text/csv');
    expect(result.content).toContain('wallet.transfer');
    expect(result.content).toContain(entries[0].hash);
  });

  it('exports a signed archive containing manifest.json and entries.json', () => {
    const result = exportAuditTrail('archive', manifest, entries);
    expect(result.contentType).toBe('application/zip');

    const zip = Buffer.from(result.content, 'base64');
    const files = readZipArchive(zip);
    const names = files.map((f) => f.name);
    expect(names).toEqual(['manifest.json', 'entries.json']);

    const manifestFile = files.find((f) => f.name === 'manifest.json')!;
    const parsedManifest = JSON.parse(manifestFile.content.toString('utf8'));
    expect(parsedManifest.chainRootHash).toBe(rootHash);
  });
});
