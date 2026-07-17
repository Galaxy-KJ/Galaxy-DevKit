-- Compliance reporting tables (Issue #335 / Roadmap #67)
-- Stores generated reports and scheduled report jobs.

create table if not exists compliance_reports (
  id               text primary key default gen_random_uuid()::text,
  user_id          text not null,
  report_type      text not null
                   check (report_type in ('transaction', 'defi_activity', 'user_activity', 'risk_exposure')),
  format           text not null
                   check (format in ('json', 'csv', 'pdf')),
  status           text not null default 'pending'
                   check (status in ('pending', 'completed', 'failed')),
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  schedule_id      text,
  idempotency_key  text not null,
  redact_pii       boolean not null default true,
  row_count        integer not null default 0,
  content          text,
  content_type     text,
  error_message    text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create unique index if not exists compliance_reports_idempotency_key_uidx
  on compliance_reports (idempotency_key);

create index if not exists compliance_reports_user_id_idx
  on compliance_reports (user_id);

create index if not exists compliance_reports_user_type_created_idx
  on compliance_reports (user_id, report_type, created_at desc);

create table if not exists compliance_schedules (
  id               text primary key default gen_random_uuid()::text,
  user_id          text not null,
  report_type      text not null
                   check (report_type in ('transaction', 'defi_activity', 'user_activity', 'risk_exposure')),
  format           text not null
                   check (format in ('json', 'csv', 'pdf')),
  cadence          text not null
                   check (cadence in ('daily', 'weekly', 'monthly')),
  redact_pii       boolean not null default true,
  enabled          boolean not null default true,
  next_run_at      timestamptz not null,
  last_run_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists compliance_schedules_user_id_idx
  on compliance_schedules (user_id);

create index if not exists compliance_schedules_due_idx
  on compliance_schedules (enabled, next_run_at)
  where enabled = true;
