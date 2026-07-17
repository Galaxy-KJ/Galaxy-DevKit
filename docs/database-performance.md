# Database Query Performance

This document covers the Supabase query audit performed for
[Issue #342](https://github.com/Galaxy-KJ/Galaxy-DevKit/issues/342): what was
found, what changed, and what's intentionally left for a follow-up PR.

## Audit methodology

1. Grepped every package for `.from(<table>)` Supabase calls to build a
   complete list of tables actually queried by the running application
   (as opposed to tables that only exist in the schema).
2. For each query site, checked whether the filter/sort columns were backed
   by an index that could serve the whole predicate — not just some of it.
3. For unbounded or offset-paginated list queries, checked whether the table
   is append-only / high-volume (a candidate for the OFFSET performance
   cliff) or naturally bounded (a user's own alert count, an org's member
   roster).
4. Verified query plans locally with `EXPLAIN ANALYZE` against a seeded
   `supabase start` instance (see "Reproducing the audit" below).

### Tables actually queried today

`audit_logs`, `monitoring_alerts`, `alert_events`, `organizations`,
`organization_members`, `organization_activity`, `smart_wallets`,
`wallet_events`, `api_sessions`, `api_keys`, `users`.

The `transactions` and `market_data` tables created in the initial schema
migration are **not** queried anywhere in the current codebase — they
predate the `smart_wallets` non-custodial model. DeFi position and Oracle
price data are also not Supabase-backed today (`packages/core/defi-protocols`
and `packages/core/oracles` call protocols/price sources directly, in
memory). Two of the issue's five "optimization targets" therefore don't
apply yet; indexing/pagination work for them is deferred until those
features persist to Supabase.

## What changed

### 1. Composite indexes (`supabase/migrations/20260717120000_query_performance_indexes.sql`)

| Index | Query it serves |
|---|---|
| `idx_audit_logs_user_timestamp (user_id, timestamp DESC)` | `AuditLogger.query()` filtered by user + time range |
| `idx_audit_logs_action_timestamp (action, timestamp DESC)` | `AuditLogger.query()` filtered by action + time range |
| `idx_api_sessions_user_active_created (user_id, is_active, created_at DESC)` | `SessionService.getUserSessions()` |
| `idx_api_sessions_active_expiry (expires_at) WHERE is_active` | `SessionService.cleanupExpiredSessions()` (partial index — mirrors the existing `idx_monitoring_alerts_worker_scan` pattern) |
| `idx_monitoring_alerts_user_status_created (user_id, status, created_at DESC)` | `GET /alerts` (`MonitoringAlertRepository.list`) |

`session_token` and `refresh_token` on `api_sessions` are already `UNIQUE`,
so their point lookups (`validateSession`, `refreshSession`) already hit an
optimal unique index — no composite needed there.
`organization_activity` and `alert_events` already had
`(parent_id, timestamp DESC)` composites from their original migrations;
those now directly back the cursor pagination described below.

### 2. Slow query logging (`packages/api/rest/src/utils/query-metrics.ts`)

`withQueryLogging(label, fn)` wraps a Supabase call, times it, and logs
`[slow-query] <label> took <n>ms (threshold <n>ms)` via `console.warn` when
execution exceeds `SLOW_QUERY_THRESHOLD_MS` (default **100ms**, matching the
issue's acceptance criterion). It's wired into the highest-traffic read
paths: `AuditLogger.query`, `TeamsRepository.findMembership` /
`listMembers` / `listActivity`, and `MonitoringAlertRepository.list` /
`listEventsForUser`. Extending it to the remaining repositories
(`session-service.ts`, `auth-service.ts`, `user-service.ts`) is
mechanical and left for a follow-up.

### 3. Cursor (keyset) pagination (`packages/api/rest/src/utils/pagination.ts`)

Applied to the three genuinely unbounded, time-ordered lists in the API:

- `AuditLogger.query` (previously **unbounded** — it fetched every matching
  row with no limit at all; this is the one real correctness bug found
  during the audit, not just a performance issue)
- `GET /organizations/:orgId/activity` (`TeamsRepository.listActivity`)
- `GET /alerts/:id/events` (`MonitoringAlertRepository.listEventsForUser`)

A cursor is the base64url-encoded sort-column value of the last row on the
page. Callers pass it back via `?cursor=...`; the server does
`.lt(sortColumn, decoded)` instead of `OFFSET n`, which stays O(limit)
however deep the pagination goes (`OFFSET n` degrades linearly with `n`
because Postgres still has to walk and discard the first `n` rows). Response
shape:

```json
{ "activity": [ /* ...page.limit items... */ ], "nextCursor": "MjAyNi0wNy0xN1QxMjowMDowMC4wMDBa" }
```

`nextCursor` is `null` on the last page.

**`GET /alerts`** (`MonitoringAlertRepository.list`) and
**`GET /organizations/:orgId/members`** (`listMembers`) intentionally kept
their existing offset-based pagination (capped at 100 rows/page). Both are
naturally bounded by real-world cardinality — a user's own alert count, an
org's member roster — so `OFFSET` never gets deep enough to matter, and
converting them adds an API shape change for no measurable benefit. If that
assumption stops holding (e.g. very large enterprise orgs), the same
`pagination.ts` helper can be applied there directly.

## Reproducing the audit / verifying query plans

```bash
npx supabase start
npx supabase db reset   # applies all migrations, including the new one
psql "$(npx supabase status -o json | jq -r .DB_URL)" -c "
  EXPLAIN ANALYZE
  SELECT * FROM audit_logs
  WHERE user_id = '<uuid>' AND timestamp >= now() - interval '7 days'
  ORDER BY timestamp DESC LIMIT 51;
"
```

Before this migration, that plan shows a `Bitmap Heap Scan` combining the
separate `user_id` and `timestamp` indexes; after, it uses a single
`Index Scan` on `idx_audit_logs_user_timestamp` and drops the sort step
entirely (the index is already in `timestamp DESC` order).

## Slow query logging configuration

Set `SLOW_QUERY_THRESHOLD_MS` (milliseconds, default `100`) in the API's
environment to tune the warn threshold. Invalid or missing values fall back
to the default.

## Out of scope / follow-up work

- Extend `withQueryLogging` to `session-service.ts`, `auth-service.ts`,
  `user-service.ts`.
- Materialized views for aggregation-heavy dashboards — no such dashboard
  queries exist against Supabase yet.
- Connection pooling configuration recommendations — the API package uses
  a single long-lived `SupabaseClient` per process today; revisit once
  the API runs with multiple workers behind a pooler (PgBouncer/Supavisor).
- Indexing/pagination for DeFi positions and Oracle price history once
  those are persisted to Supabase.
