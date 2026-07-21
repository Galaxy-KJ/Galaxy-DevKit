import { buildZipArchive, readZipArchive } from '../zip-writer';

describe('buildZipArchive / readZipArchive', () => {
  it('round-trips multiple entries', () => {
    const zip = buildZipArchive([
      { name: 'manifest.json', content: '{"a":1}' },
      { name: 'entries.json', content: '[1,2,3]' },
    ]);

    const entries = readZipArchive(zip);
    expect(entries).toHaveLength(2);
    expect(entries[0].name).toBe('manifest.json');
    expect(entries[0].content.toString('utf8')).toBe('{"a":1}');
    expect(entries[1].name).toBe('entries.json');
    expect(entries[1].content.toString('utf8')).toBe('[1,2,3]');
  });

  it('produces a valid ZIP signature and end-of-central-directory record', () => {
    const zip = buildZipArchive([{ name: 'a.txt', content: 'hello' }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });
});
