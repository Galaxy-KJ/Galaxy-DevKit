-- Custom metrics: private definitions and bounded materialized snapshots.
CREATE TABLE public.metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('transactions','oracle_prices','automation_executions','derived')),
  aggregation text NOT NULL CHECK (aggregation IN ('count','sum','avg','min','max','p50','p95','p99','rate','distinct_count')),
  metric_window text NOT NULL CHECK (metric_window IN ('5m','1h','24h','7d','30d','day_to_date','week_to_date','month_to_date')),
  dimensions jsonb NOT NULL DEFAULT '[]',
  filters jsonb NOT NULL DEFAULT '{}',
  field text NOT NULL,
  unit text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  expression text,
  metric_references jsonb NOT NULL DEFAULT '{}',
  target double precision,
  direction text CHECK (direction IN ('higher_is_better','lower_is_better')),
  revision uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,id),
  CHECK (jsonb_typeof(dimensions) = 'array' AND jsonb_array_length(dimensions) <= 7),
  CHECK (jsonb_typeof(filters) = 'object'),
  CHECK (jsonb_typeof(metric_references) = 'object')
);
CREATE INDEX metric_definitions_user_updated ON public.metric_definitions(user_id,updated_at,id);
CREATE TABLE public.metric_materializations (
  user_id uuid NOT NULL,
  metric_id uuid NOT NULL,
  fingerprint text NOT NULL,
  value jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,metric_id),
  FOREIGN KEY(user_id,metric_id) REFERENCES public.metric_definitions(user_id,id) ON DELETE CASCADE
);
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_materializations ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_definitions_read ON public.metric_definitions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY metric_materializations_read ON public.metric_materializations FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.metric_definitions, public.metric_materializations FROM anon, authenticated;
GRANT SELECT ON public.metric_definitions, public.metric_materializations TO authenticated;
GRANT ALL ON public.metric_definitions, public.metric_materializations TO service_role;

-- All writes use this serialized RPC, including batch imports. Limits and graph
-- checks run inside the transaction, preventing concurrent cap/cycle races.
CREATE FUNCTION public.save_metric_definitions(p_user_id uuid, p_definitions jsonb, p_delete_id uuid DEFAULT NULL)
RETURNS SETOF public.metric_definitions LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; metric_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 413));
  IF jsonb_typeof(p_definitions) <> 'array' OR jsonb_array_length(p_definitions) > 50 THEN
    RAISE EXCEPTION 'Invalid metric batch';
  END IF;
  IF p_delete_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.metric_definitions d, jsonb_each_text(d.metric_references) r
               WHERE d.user_id = p_user_id AND r.value = p_delete_id::text) THEN
      RAISE EXCEPTION 'Metric is referenced by another definition';
    END IF;
    DELETE FROM public.metric_definitions WHERE user_id = p_user_id AND id = p_delete_id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_definitions) LOOP
    metric_id := (item->>'id')::uuid;
    IF EXISTS (SELECT 1 FROM public.metric_definitions WHERE id = metric_id AND user_id <> p_user_id) THEN
      RAISE EXCEPTION 'Metric ID unavailable';
    END IF;
    INSERT INTO public.metric_definitions(id,user_id,name,description,source,aggregation,metric_window,dimensions,filters,field,unit,enabled,expression,metric_references,target,direction)
    VALUES(metric_id,p_user_id,item->>'name',item->>'description',item->>'source',item->>'aggregation',item->>'window',item->'dimensions',item->'filters',item->>'field',item->>'unit',(item->>'enabled')::boolean,item->>'expression',coalesce(item->'references','{}'),(item->>'target')::double precision,item->>'direction')
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,source=EXCLUDED.source,aggregation=EXCLUDED.aggregation,metric_window=EXCLUDED.metric_window,dimensions=EXCLUDED.dimensions,filters=EXCLUDED.filters,field=EXCLUDED.field,unit=EXCLUDED.unit,enabled=EXCLUDED.enabled,expression=EXCLUDED.expression,metric_references=EXCLUDED.metric_references,target=EXCLUDED.target,direction=EXCLUDED.direction,revision=gen_random_uuid(),updated_at=now()
    WHERE public.metric_definitions.user_id = p_user_id;
  END LOOP;
  IF (SELECT count(*) FROM public.metric_definitions WHERE user_id=p_user_id) > 50 THEN RAISE EXCEPTION 'Metric definition limit exceeded'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.metric_definitions d CROSS JOIN LATERAL jsonb_each_text(d.metric_references) r
    LEFT JOIN public.metric_definitions dependency ON dependency.id::text=r.value AND dependency.user_id=p_user_id
    WHERE d.user_id=p_user_id AND (dependency.id IS NULL OR dependency.metric_window<>d.metric_window OR dependency.dimensions<>d.dimensions)
  ) THEN RAISE EXCEPTION 'References must exist, belong to this user and share window and dimensions'; END IF;
  IF EXISTS (
    WITH RECURSIVE edges AS (
      SELECT d.id::text AS parent,r.value AS child FROM public.metric_definitions d,jsonb_each_text(d.metric_references) r WHERE d.user_id=p_user_id
    ), walk AS (
      SELECT parent,child FROM edges
      UNION SELECT w.parent,e.child FROM walk w JOIN edges e ON e.parent=w.child
    ) SELECT 1 FROM walk WHERE parent=child
  ) THEN RAISE EXCEPTION 'Cyclic metric reference'; END IF;
  RETURN QUERY SELECT * FROM public.metric_definitions WHERE user_id=p_user_id ORDER BY id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_metric_definitions(uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_metric_definitions(uuid,jsonb,uuid) TO service_role;
