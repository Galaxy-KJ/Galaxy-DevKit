ALTER TYPE public.monitoring_alert_type ADD VALUE IF NOT EXISTS 'custom_metric_above';
ALTER TYPE public.monitoring_alert_type ADD VALUE IF NOT EXISTS 'custom_metric_below';
ALTER TABLE public.monitoring_alerts ADD COLUMN custom_metric_id uuid;
ALTER TABLE public.monitoring_alerts ADD CONSTRAINT monitoring_alerts_metric_owner_fk
  FOREIGN KEY(user_id,custom_metric_id) REFERENCES public.metric_definitions(user_id,id);
CREATE INDEX monitoring_alerts_metric_owner ON public.monitoring_alerts(user_id,custom_metric_id) WHERE custom_metric_id IS NOT NULL;
ALTER TABLE public.monitoring_alerts DROP CONSTRAINT monitoring_alerts_threshold_positive;
ALTER TABLE public.monitoring_alerts ADD CONSTRAINT monitoring_alerts_threshold_valid CHECK (
  threshold <> 'NaN'::numeric AND (threshold > 0 OR alert_type::text IN ('custom_metric_above','custom_metric_below'))
);
ALTER TABLE public.monitoring_alerts ADD CONSTRAINT monitoring_alerts_metric_required CHECK (
  (alert_type::text IN ('custom_metric_above','custom_metric_below')) = (custom_metric_id IS NOT NULL)
);
