-- =============================================================================
-- Migration: drop _deprecated_encrypted_private_key from invisible_wallets
-- Phase 1 – Non-custodial milestone
--
-- The smart-wallet stack is now complete. Private keys are generated and stored
-- exclusively on the client device. The _deprecated_encrypted_private_key column
-- (and its alias encrypted_private_key, if it exists) are no longer written or
-- read by any application code, so they can be safely dropped.
-- =============================================================================

-- Guarded against environments where invisible_wallets was never created
-- (the table lives in a separate migration stream). Makes the migration
-- idempotent and safe for fresh local resets.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'invisible_wallets') THEN
    ALTER TABLE public.invisible_wallets
      DROP COLUMN IF EXISTS _deprecated_encrypted_private_key;
    ALTER TABLE public.invisible_wallets
      DROP COLUMN IF EXISTS encrypted_private_key;

    EXECUTE 'COMMENT ON TABLE public.invisible_wallets IS '
      || quote_literal('Non-custodial wallet registry (Phase 1). '
        || 'Stores only public metadata: id, user_id, public_key, network. '
        || 'Private keys MUST NOT be persisted server-side — they live exclusively on the user device.');
  END IF;
END $$;