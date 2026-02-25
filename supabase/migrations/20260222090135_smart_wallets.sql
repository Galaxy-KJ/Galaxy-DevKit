-- 1. New table for non-custodial smart wallets
create table if not exists smart_wallets (
    id text primary key default gen_random_uuid()::text,
    user_id text not null,
    contract_address text not null,
    passkey_credential_id text not null,
    public_key_65bytes text not null,
    network text not null default 'testnet',
    created_at timestamptz not null default now()
);

-- 2. Row-level security
alter table smart_wallets enable row level security;

create policy "users can read own smart wallets"
    on smart_wallets for select
    using (auth.uid()::text = user_id);

create policy "service role can insert smart wallets"
    on smart_wallets for insert
    with check (true);

-- 3. Index for fast user lookups
create index if not exists smart_wallets_user_id_idx on smart_wallets (user_id);

-- 4. Deprecate encrypted_private_key on invisible_wallets (rename, not drop — safer)
alter table invisible_wallets rename column encrypted_private_key to _deprecated_encrypted_private_key;
