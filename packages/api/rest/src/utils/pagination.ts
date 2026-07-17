/**
 * @fileoverview Keyset (cursor-based) pagination helpers.
 * @description Cursors are opaque, base64url-encoded values of the sort
 *              column from the last row of the previous page (e.g. an ISO
 *              timestamp). Callers fetch `limit + 1` rows ordered by that
 *              column descending, filter with `.lt(column, decodedCursor)`
 *              when a cursor is present, then hand the raw rows to
 *              `buildCursorPage` to trim to `limit` and derive the next
 *              cursor. This avoids the deep-offset performance cliff of
 *              `OFFSET n` on large, frequently-appended tables (audit logs,
 *              activity feeds, alert delivery history).
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

export interface CursorPageResult<T> {
  items: T[];
  nextCursor: string | null;
}

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function encodeCursor(sortValue: string): string {
  return Buffer.from(sortValue, 'utf8').toString('base64url');
}

/** Returns null for a missing/malformed cursor so callers can treat it as "first page". */
export function decodeCursor(cursor: string): string | null {
  if (!BASE64URL_PATTERN.test(cursor)) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Trims `rows` (fetched with `limit + 1`) down to `limit` items and derives
 * the next cursor from the last retained row when more rows exist.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  getSortValue: (row: T) => string
): CursorPageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last !== undefined ? encodeCursor(getSortValue(last)) : null;
  return { items, nextCursor };
}
