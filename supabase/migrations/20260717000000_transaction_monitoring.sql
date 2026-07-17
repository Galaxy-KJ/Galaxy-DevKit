-- Real-time transaction monitoring (Issue #336).
-- Rules and monitored accounts are organization-scoped; alerts are immutable
-- evidence records that can be delivered through Supabase Realtime.

CREATE TYPE transaction_monitoring_rule_type AS ENUM (
  'large_transfer',
  'rapid_transactions',
  'unusual_counterparty',
  'defi_position_change',
  'failed_transactions'
);

CREATE TYPE transaction_monitoring_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE public.transaction_monitoring_accounts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_address TEXT NOT NULL CHECK (account_address ~ '^G[A-Z2-7]{55}$'),
  network TEXT NOT NULL DEFAULT 'testnet' CHECK (network IN ('testnet', 'mainnet')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transaction_monitoring_accounts_unique UNIQUE (organization_id, account_address, network)
);

CREATE INDEX idx_transaction_monitoring_accounts_stream
  ON public.transaction_monitoring_accounts (network, account_address) WHERE active;

CREATE TABLE public.transaction_monitoring_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  rule_type transaction_monitoring_rule_type NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity transaction_monitoring_severity NOT NULL DEFAULT 'medium',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transaction_monitoring_rules_active
  ON public.transaction_monitoring_rules (organization_id, rule_type) WHERE active;

CREATE TABLE public.transaction_monitoring_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitored_account_id UUID REFERENCES public.transaction_monitoring_accounts(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.transaction_monitoring_rules(id) ON DELETE SET NULL,
  transaction_hash TEXT NOT NULL,
  pattern transaction_monitoring_rule_type NOT NULL,
  severity transaction_monitoring_severity NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transaction_monitoring_events_unique UNIQUE (rule_id, transaction_hash, pattern)
);

CREATE INDEX idx_transaction_monitoring_events_org_time
  ON public.transaction_monitoring_events (organization_id, occurred_at DESC);

CREATE TRIGGER update_transaction_monitoring_accounts_updated_at
  BEFORE UPDATE ON public.transaction_monitoring_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transaction_monitoring_rules_updated_at
  BEFORE UPDATE ON public.transaction_monitoring_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.transaction_monitoring_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_monitoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_monitoring_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view transaction monitoring accounts"
  ON public.transaction_monitoring_accounts FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = transaction_monitoring_accounts.organization_id AND m.user_id = auth.uid())
  );
CREATE POLICY "Organization members can view transaction monitoring rules"
  ON public.transaction_monitoring_rules FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = transaction_monitoring_rules.organization_id AND m.user_id = auth.uid())
  );
CREATE POLICY "Organization members can view transaction monitoring events"
  ON public.transaction_monitoring_events FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = transaction_monitoring_events.organization_id AND m.user_id = auth.uid())
  );

-- The websocket API subscribes with the service role. Publishing INSERT events
-- lets connected organization members receive alerts without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_monitoring_events;
