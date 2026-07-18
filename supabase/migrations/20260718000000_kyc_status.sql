-- Migration: 20260718000000_kyc_status
-- Purpose: Create KYC status tracking table and RLS policies

CREATE TYPE kyc_status_enum AS ENUM ('pending', 'approved', 'rejected', 'flagged', 'unverified');

CREATE TABLE kyc_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status kyc_status_enum NOT NULL DEFAULT 'unverified',
    risk_score INTEGER NOT NULL DEFAULT 0,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE kyc_status ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own KYC status"
    ON kyc_status FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage KYC status"
    ON kyc_status FOR ALL
    USING (auth.role() = 'service_role');

-- Create updated_at trigger function if it doesn't exist (assuming it's already defined, but just in case)
-- CREATE OR REPLACE FUNCTION update_modified_column() ...

CREATE TRIGGER update_kyc_status_modtime
    BEFORE UPDATE ON kyc_status
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
