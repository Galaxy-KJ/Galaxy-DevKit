-- Persist automation definitions and execution metrics outside the process.
create table if not exists public.automation_rules (
  id text primary key,
  user_id uuid not null,
  name text not null,
  trigger_type text not null,
  status text not null,
  cron_expression text,
  rule jsonb not null,
  execution_count integer not null default 0,
  failure_count integer not null default 0,
  last_executed timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_active_idx
  on public.automation_rules (status, trigger_type);
create index if not exists automation_rules_user_idx
  on public.automation_rules (user_id);

create table if not exists public.automation_metrics (
  rule_id text primary key references public.automation_rules(id) on delete cascade,
  execution_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  total_execution_time bigint not null default 0,
  last_execution_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.automation_rules is 'Durable source of truth for automation rules; process maps are caches.';
comment on table public.automation_metrics is 'Durable aggregate execution metrics for automation rules.';
