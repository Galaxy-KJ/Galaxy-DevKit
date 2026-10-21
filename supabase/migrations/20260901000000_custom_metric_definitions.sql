-- Galaxy DevKit - Custom Metrics & KPI Definition Engine (Issue #413 / Roadmap #74)
-- Allows operators to define custom metrics, aggregations, rolling/calendar windows,
-- dimension groupings, KPI targets, and derived arithmetic metrics without code changes.

CREATE TABLE IF NOT EXISTS public.metric_definitions (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description         TEXT,
  source              TEXT NOT NULL CHECK (
    source IN ('transactions', 'wallet_events', 'defi_positions', 'oracle_prices', 'automation_executions', 'api_request_logs')
  ),
  aggregation         TEXT NOT NULL CHECK (
    aggregation IN ('count', 'sum', 'avg', 'min', 'max', 'p50', 'p95', 'p99', 'rate', 'distinct_count')
  ),
  target_field        TEXT,
  window              TEXT NOT NULL CHECK (
    window IN ('5m', '1h', '24h', '7d', '30d', 'day_to_date', 'week_to_date', 'month_to_date')
  ),
  dimensions          JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters             JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit                TEXT NOT NULL DEFAULT '',
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  formula             TEXT,
  target              NUMERIC(20, 8),
  direction           TEXT CHECK (direction IS NULL OR direction IN ('higher_is_better', 'lower_is_better')),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_metric_definitions_user_created
  ON public.metric_definitions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_definitions_org
  ON public.metric_definitions (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_metric_definitions_enabled
  ON public.metric_definitions (enabled)
  WHERE enabled = TRUE;

-- Materialized snapshots for precomputed / expensive definitions
CREATE TABLE IF NOT EXISTS public.metric_materializations (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  metric_id           UUID NOT NULL REFERENCES public.metric_definitions(id) ON DELETE CASCADE,
  window_start        TIMESTAMPTZ NOT NULL,
  window_end          TIMESTAMPTZ NOT NULL,
  value               NUMERIC(20, 8) NOT NULL,
  dimensions          JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_materializations_lookup
  ON public.metric_materializations (metric_id, window_end DESC);

-- Trigger for updated_at
CREATE TRIGGER update_metric_definitions_updated_at
  BEFORE UPDATE ON public.metric_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_materializations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metric definitions" ON public.metric_definitions
  FOR SELECT USING (
    auth.uid() = user_id OR (
      organization_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.organization_id = metric_definitions.organization_id AND m.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert own metric definitions" ON public.metric_definitions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metric definitions" ON public.metric_definitions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own metric definitions" ON public.metric_definitions
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own metric materializations" ON public.metric_materializations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.metric_definitions d
      WHERE d.id = metric_materializations.metric_id AND (
        d.user_id = auth.uid() OR (
          d.organization_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.organization_members m
            WHERE m.organization_id = d.organization_id AND m.user_id = auth.uid()
          )
        )
      )
    )
  );
