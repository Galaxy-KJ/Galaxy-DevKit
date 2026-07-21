-- Enhanced structured audit logging (Issue #334)
-- Adds actor/severity/correlation fields to the structured log format,
-- makes audit_logs append-only, and provides a retention helper.

alter table audit_logs
  add column if not exists organization_id text,
  add column if not exists resource_id     text,
  add column if not exists severity        text not null default 'info',
  add column if not exists correlation_id  text;

alter table audit_logs
  drop constraint if exists audit_logs_severity_check;

alter table audit_logs
  add constraint audit_logs_severity_check
  check (severity in ('info', 'warning', 'critical'));

create index if not exists audit_logs_organization_id_idx on audit_logs (organization_id);
create index if not exists audit_logs_severity_idx on audit_logs (severity);
create index if not exists audit_logs_correlation_id_idx on audit_logs (correlation_id);

-- Append-only: audit_logs is written by AuditLogger using the service role.
-- Revoke UPDATE/DELETE so entries can only ever be inserted or read, never
-- altered or removed through the application's own credentials. Combined
-- with the export hash-chain (Issue #338), this makes tampering both
-- structurally prevented (writes) and detectable (exports).
revoke update, delete on audit_logs from service_role;
revoke update, delete on audit_logs from authenticated;
revoke update, delete on audit_logs from anon;

-- Retention: deletes audit_logs entries older than `retention_days`.
-- Intentionally NOT scheduled from this migration (no pg_cron usage exists
-- elsewhere in this project) -- invoke from an external scheduler/ops job,
-- e.g. `select purge_audit_logs(365);`. Runs as the function owner so it
-- can bypass the append-only revoke above for genuine retention cleanup.
create or replace function purge_audit_logs(retention_days integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count bigint;
begin
  if retention_days is null or retention_days <= 0 then
    raise exception 'retention_days must be a positive integer';
  end if;

  delete from audit_logs
  where "timestamp" < now() - (retention_days || ' days')::interval;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
