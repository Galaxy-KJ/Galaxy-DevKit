-- =============================================================================
-- Migration: drop _deprecated_encrypted_private_key from invisible_wallets
-- Phase 1 – Non-custodial milestone
--
-- The smart-wallet stack is now complete. Private keys are generated and stored
-- exclusively on the client device. The _deprecated_encrypted_private_key column
-- (and its alias encrypted_private_key, if it exists) are no longer written or
-- read by any application code, so they can be safely dropped.
-- =============================================================================

-- Drop the column that was already being renamed as a deprecation signal
ALTER TABLE invisible_wallets
  DROP COLUMN IF EXISTS _deprecated_encrypted_private_key;

-- Drop the original name as well in case an older migration left it
ALTER TABLE invisible_wallets
  DROP COLUMN IF EXISTS encrypted_private_key;

-- Document the architectural intent permanently on the table
COMMENT ON TABLE invisible_wallets IS
  'Non-custodial wallet registry (Phase 1). '
  'Stores only public metadata: id, user_id, public_key, network. '
  'Private keys MUST NOT be persisted server-side — they live exclusively on the user device.';