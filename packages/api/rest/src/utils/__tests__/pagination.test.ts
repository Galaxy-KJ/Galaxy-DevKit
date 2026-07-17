import { buildCursorPage, decodeCursor, encodeCursor } from '../pagination';

describe('pagination cursor helpers', () => {
  it('round-trips a sort value through encode/decode', () => {
    const iso = '2026-07-17T12:00:00.000Z';
    expect(decodeCursor(encodeCursor(iso))).toBe(iso);
  });

  it('returns null for a malformed cursor', () => {
    expect(decodeCursor('%%%not-base64%%%')).toBeNull();
  });

  describe('buildCursorPage', () => {
    const rows = [
      { id: '1', createdAt: '2026-07-17T12:00:03.000Z' },
      { id: '2', createdAt: '2026-07-17T12:00:02.000Z' },
      { id: '3', createdAt: '2026-07-17T12:00:01.000Z' },
    ];
    const getSortValue = (r: { createdAt: string }) => r.createdAt;

    it('returns all rows with no next cursor when under the limit', () => {
      const page = buildCursorPage(rows, 5, getSortValue);
      expect(page.items).toEqual(rows);
      expect(page.nextCursor).toBeNull();
    });

    it('trims to `limit` and derives a next cursor when more rows exist', () => {
      const page = buildCursorPage(rows, 2, getSortValue);
      expect(page.items).toEqual(rows.slice(0, 2));
      expect(page.nextCursor).toBe(encodeCursor(rows[1].createdAt));
    });

    it('returns no next cursor when rows exactly fill the page', () => {
      const page = buildCursorPage(rows, 3, getSortValue);
      expect(page.items).toEqual(rows);
      expect(page.nextCursor).toBeNull();
    });

    it('handles an empty result set', () => {
      const page = buildCursorPage([], 10, getSortValue);
      expect(page.items).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });
  });
});
