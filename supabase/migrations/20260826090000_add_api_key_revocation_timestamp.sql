-- Preserve the revocation time for API-key inventory and audit consumers.
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_api_keys_revoked_at
  ON public.api_keys(revoked_at);
