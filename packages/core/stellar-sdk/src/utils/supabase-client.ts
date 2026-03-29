// @ts-nocheck

import { createClient } from '@supabase/supabase-js';

const supabaseURL = process.env.SUPABASE_URL;
const supabaseANON = process.env.SUPABASE_ANON_KEY;

if (!supabaseURL || !supabaseANON) {
  throw new Error(
    'Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set'
  );
}

export const supabaseClient = createClient(supabaseURL, supabaseANON);
