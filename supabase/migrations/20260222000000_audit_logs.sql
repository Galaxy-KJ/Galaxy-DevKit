create table if not exists audit_logs (
  id          text primary key default gen_random_uuid()::text,
  timestamp   timestamptz not null default now(),
  user_id     text,
  action      text not null,
  resource    text,
  ip_address  text,
  success     boolean not null,
  error_code  text,
  metadata    jsonb
);

create index if not exists audit_logs_user_id_idx on audit_logs (user_id);
create index if not exists audit_logs_timestamp_idx on audit_logs (timestamp desc);
