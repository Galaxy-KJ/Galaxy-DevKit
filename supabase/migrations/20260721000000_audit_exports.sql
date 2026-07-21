-- Audit trail export tables (Issue #338 / Roadmap #70)
-- Stores generated exports with hash-chain integrity metadata and tracks
-- the last completed export per user to support incremental exports.

create table if not exists audit_exports (
  id                text primary key default gen_random_uuid()::text,
  user_id           text not null,
  format            text not null
                    check (format in ('json', 'csv', 'archive')),
  status            text not null default 'pending'
                    check (status in ('pending', 'processing', 'completed', 'failed')),
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  filter_action     text,
  filter_resource   text,
  incremental       boolean not null default false,
  record_count      integer not null default 0,
  chain_root_hash   text,
  content           text,
  content_type      text,
  error_message     text,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);

create index if not exists audit_exports_user_id_idx
  on audit_exports (user_id);

create index if not exists audit_exports_user_created_idx
  on audit_exports (user_id, created_at desc);

-- Tracks the last completed export cursor per user, used to compute the
-- `from` boundary for incremental exports without scanning audit_exports.
create table if not exists audit_export_cursors (
  user_id           text primary key,
  last_exported_at  timestamptz not null,
  updated_at        timestamptz not null default now()
);
