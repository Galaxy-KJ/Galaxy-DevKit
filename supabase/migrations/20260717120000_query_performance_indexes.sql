-- Galaxy DevKit - Query performance indexes (Issue #342, Roadmap #76)
-- Composite/partial indexes for the hot-path query shapes identified while
-- auditing existing repositories with EXPLAIN ANALYZE (see
-- docs/database-performance.md for methodology and before/after plans).
--
-- Each index below targets a query that previously relied on a single-column
-- index (or none), forcing either a bitmap AND of two indexes or a sequential
-- scan under filter + sort. All statements are idempotent (IF NOT EXISTS) so
-- this migration is safe to re-run.

-- audit_logs: AuditLogger.query() filters by user_id and/or action, always
-- combined with a timestamp range, ordered by timestamp DESC.
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp
  ON public.audit_logs (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp
  ON public.audit_logs (action, timestamp DESC);

-- api_sessions: SessionService.getUserSessions() filters by user_id + is_active,
-- ordered by created_at DESC. The prior single-column indexes on user_id and
-- is_active independently required a bitmap AND plus a separate sort.
CREATE INDEX IF NOT EXISTS idx_api_sessions_user_active_created
  ON public.api_sessions (user_id, is_active, created_at DESC);

-- api_sessions: SessionService.cleanupExpiredSessions() scans active sessions
-- past expiry. Partial index keeps it small and skips already-inactive rows
-- (mirrors the idx_monitoring_alerts_worker_scan pattern below).
CREATE INDEX IF NOT EXISTS idx_api_sessions_active_expiry
  ON public.api_sessions (expires_at)
  WHERE is_active = true;

-- monitoring_alerts: GET /alerts (MonitoringAlertRepository.list) filters by
-- user_id + optional status, ordered by created_at DESC. The prior
-- single-column idx_monitoring_alerts_user_id doesn't cover the sort or the
-- status filter.
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_user_status_created
  ON public.monitoring_alerts (user_id, status, created_at DESC);

-- Note: session_token and refresh_token on api_sessions are already UNIQUE
-- (see 20241201120000_add_api_authentication.sql), so their point lookups in
-- validateSession/refreshSession already use an optimal unique index — no
-- composite needed there. organization_activity and alert_events already
-- carry (parent_id, timestamp DESC) composites from their original
-- migrations and directly support the cursor pagination added alongside
-- this migration.
