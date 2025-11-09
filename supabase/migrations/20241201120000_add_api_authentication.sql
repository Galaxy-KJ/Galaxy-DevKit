-- Galaxy DevKit API Authentication Migration
-- This migration creates tables for API keys and API sessions

-- API Keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  scopes JSONB DEFAULT '[]'::jsonb,
  rate_limit INTEGER DEFAULT 1000,
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- API Sessions table
CREATE TABLE IF NOT EXISTS public.api_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  refresh_token TEXT UNIQUE NOT NULL,
  device_info JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  refresh_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON public.api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id_active ON public.api_keys(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_api_sessions_user_id ON public.api_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_api_sessions_session_token ON public.api_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_api_sessions_refresh_token ON public.api_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_api_sessions_is_active ON public.api_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_api_sessions_expires_at ON public.api_sessions(expires_at);

-- Add updated_at trigger for api_keys
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at trigger for api_sessions (update last_accessed_at on access)
CREATE OR REPLACE FUNCTION update_api_sessions_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Note: last_accessed_at is updated manually in the application, not via trigger
-- This is to have more control over when it's updated

-- Row Level Security (RLS) policies
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_sessions ENABLE ROW LEVEL SECURITY;

-- API Keys policies
CREATE POLICY "Users can view own api keys" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own api keys" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api keys" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api keys" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can access all API keys (for validation)
CREATE POLICY "Service role can access all api keys" ON public.api_keys
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- API Sessions policies
CREATE POLICY "Users can view own sessions" ON public.api_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sessions" ON public.api_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.api_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON public.api_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can access all sessions (for validation)
CREATE POLICY "Service role can access all sessions" ON public.api_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Add comments for documentation
COMMENT ON TABLE public.api_keys IS 'Stores API keys for server-to-server authentication';
COMMENT ON TABLE public.api_sessions IS 'Stores active user sessions for REST API';

COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 hash of the API key (never store plain keys)';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'First 8 characters of the API key for display purposes';
COMMENT ON COLUMN public.api_keys.scopes IS 'Array of permission scopes for this API key';
COMMENT ON COLUMN public.api_keys.rate_limit IS 'Maximum requests per minute for this API key';

COMMENT ON COLUMN public.api_sessions.session_token IS 'Unique session token for authentication';
COMMENT ON COLUMN public.api_sessions.refresh_token IS 'Unique refresh token for session renewal';
COMMENT ON COLUMN public.api_sessions.device_info IS 'JSON object containing device information';

