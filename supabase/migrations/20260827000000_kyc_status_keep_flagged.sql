-- Migration: 20260827000000_kyc_status_keep_flagged
-- Purpose: A flagged (sanctioned) user can never leave the flagged status
-- through an UPDATE, so a concurrent re-verification cannot clear the flag.

CREATE OR REPLACE FUNCTION kyc_status_keep_flagged()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'flagged' AND NEW.status <> 'flagged' THEN
        RAISE EXCEPTION 'kyc_status is flagged and cannot be changed to %', NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kyc_status_keep_flagged ON kyc_status;

CREATE TRIGGER kyc_status_keep_flagged
    BEFORE UPDATE ON kyc_status
    FOR EACH ROW
    EXECUTE FUNCTION kyc_status_keep_flagged();
