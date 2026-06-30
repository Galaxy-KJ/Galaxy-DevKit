-- Galaxy DevKit - Real-time position monitoring & liquidation alerts (Issue #306, Roadmap #53)
-- Tables:
--   * monitoring_alerts: user-configured alert subscriptions watched by the PositionMonitorWorker
--   * alert_events:      one row per dispatched notification (history + retry state)

CREATE TYPE monitoring_alert_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE monitoring_alert_type AS ENUM ('health_factor_below');
CREATE TYPE monitoring_alert_channel AS ENUM ('webhook', 'email');
CREATE TYPE alert_event_delivery_status AS ENUM ('pending', 'delivered', 'failed', 'retrying');

CREATE TABLE public.monitoring_alerts (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  protocol            TEXT NOT NULL,
  account_address     TEXT NOT NULL,
  network             network_type NOT NULL DEFAULT 'testnet',
  alert_type          monitoring_alert_type NOT NULL,
  threshold           NUMERIC(20, 8) NOT NULL,
  channel             monitoring_alert_channel NOT NULL,
  channel_config      JSONB NOT NULL,
  cooldown_seconds    INTEGER NOT NULL DEFAULT 300 CHECK (cooldown_seconds >= 0),
  status              monitoring_alert_status NOT NULL DEFAULT 'active',
  last_triggered_at   TIMESTAMP WITH TIME ZONE,
  last_evaluated_at   TIMESTAMP WITH TIME ZONE,
  last_health_factor  NUMERIC(20, 8),
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT monitoring_alerts_threshold_positive CHECK (threshold > 0)
);

CREATE TABLE public.alert_events (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  alert_id            UUID NOT NULL REFERENCES public.monitoring_alerts(id) ON DELETE CASCADE,
  triggered_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  health_factor_value NUMERIC(20, 8),
  payload             JSONB NOT NULL,
  delivery_status     alert_event_delivery_status NOT NULL DEFAULT 'pending',
  delivery_attempts   INTEGER NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMP WITH TIME ZONE,
  next_retry_at       TIMESTAMP WITH TIME ZONE,
  last_error          TEXT,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
-- Worker picks the next batch of alerts to evaluate ordered by last_evaluated_at; this index drives that scan.
CREATE INDEX idx_monitoring_alerts_worker_scan
  ON public.monitoring_alerts (status, network, last_evaluated_at NULLS FIRST)
  WHERE status = 'active';

CREATE INDEX idx_monitoring_alerts_user_id        ON public.monitoring_alerts (user_id);
CREATE INDEX idx_monitoring_alerts_account_proto  ON public.monitoring_alerts (protocol, account_address);

CREATE INDEX idx_alert_events_alert_id           ON public.alert_events (alert_id, triggered_at DESC);
CREATE INDEX idx_alert_events_retry              ON public.alert_events (delivery_status, next_retry_at)
  WHERE delivery_status IN ('pending', 'retrying');

-- updated_at triggers (reuses function declared in 20241201000001_initial_schema.sql)
CREATE TRIGGER update_monitoring_alerts_updated_at
  BEFORE UPDATE ON public.monitoring_alerts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_events_updated_at
  BEFORE UPDATE ON public.alert_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.monitoring_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own monitoring alerts" ON public.monitoring_alerts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own monitoring alerts" ON public.monitoring_alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monitoring alerts" ON public.monitoring_alerts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own monitoring alerts" ON public.monitoring_alerts
  FOR DELETE USING (auth.uid() = user_id);

-- Events are derived from alerts: a user can read events that belong to their alerts.
CREATE POLICY "Users can view events of own alerts" ON public.alert_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.monitoring_alerts a
      WHERE a.id = alert_events.alert_id
        AND a.user_id = auth.uid()
    )
  );
