-- Execution attempt log for automation transactions.
-- One open attempt per automation prevents duplicate submits across poll cycles
-- and process restarts. A row with transaction_hash must never be resent.

CREATE TYPE public.automation_execution_attempt_status AS ENUM (
  'pending',
  'executing',
  'submitted',
  'resolved',
  'failed'
);

CREATE TABLE public.automation_execution_attempts (
  id UUID PRIMARY KEY,
  automation_id UUID NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  status public.automation_execution_attempt_status NOT NULL DEFAULT 'pending',
  transaction_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_execution_attempts_automation_id
  ON public.automation_execution_attempts (automation_id, created_at DESC);

CREATE UNIQUE INDEX idx_automation_execution_attempts_open
  ON public.automation_execution_attempts (automation_id)
  WHERE status IN ('pending', 'executing', 'submitted');

ALTER TABLE public.automation_execution_attempts ENABLE ROW LEVEL SECURITY;
