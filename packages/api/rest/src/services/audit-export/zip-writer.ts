/**
 * @fileoverview Minimal, dependency-free ZIP (store-only) archive writer.
 * @description Produces a valid ZIP file containing uncompressed entries.
 *              Store-only (no DEFLATE) keeps the implementation small and
 *              avoids re-implementing a compressor; archives are still
 *              valid, tool-readable ZIPs — just not size-optimized.
 * @author Galaxy DevKit Team
 * @since 2026-07-21
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosYear = Math.max(0, date.getFullYear() - 1980);
  const date2 = ((dosYear & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, date: date2 };
}

export interface ZipEntryInput {
  name: string;
  content: string | Buffer;
}

export function buildZipArchive(entries: ZipEntryInput[], now: Date = new Date()): Buffer {
  const { time, date } = dosDateTime(now);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // method = store
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra length

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(0, 10); // method = store
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralDirStart = offset;
  const centralDirBuf = Buffer.concat(centralParts);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // central dir size
  eocd.writeUInt32LE(centralDirStart, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

/**
 * Reads a store-only ZIP produced by `buildZipArchive`. Walks local file
 * headers sequentially rather than parsing the central directory — correct
 * and sufficient for archives this module itself writes.
 */
export function readZipArchive(zip: Buffer): ZipEntryInput[] {
  const entries: ZipEntryInput[] = [];
  let pos = 0;

  while (pos + 4 <= zip.length && zip.readUInt32LE(pos) === 0x04034b50) {
    const nameLength = zip.readUInt16LE(pos + 26);
    const extraLength = zip.readUInt16LE(pos + 28);
    const compressedSize = zip.readUInt32LE(pos + 18);

    const nameStart = pos + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = zip.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const content = zip.subarray(dataStart, dataStart + compressedSize);

    entries.push({ name, content: Buffer.from(content) });
    pos = dataStart + compressedSize;
  }

  return entries;
}
