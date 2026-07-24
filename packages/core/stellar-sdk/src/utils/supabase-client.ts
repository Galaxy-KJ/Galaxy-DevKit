// @ts-nocheck

import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (client) return client;

  const supabaseURL = process.env.SUPABASE_URL;
  const supabaseANON = process.env.SUPABASE_ANON_KEY;

  if (!supabaseURL || !supabaseANON) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set'
    );
  }

  client = createClient(supabaseURL, supabaseANON);
  return client;
}

// Preserve the object-shaped API without requiring Supabase configuration for
// unrelated local features such as wallet generation.
export const supabaseClient = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, property) {
    const resolvedClient = getSupabaseClient();
    const value = Reflect.get(resolvedClient, property, resolvedClient);
    return typeof value === 'function' ? value.bind(resolvedClient) : value;
  },
});
