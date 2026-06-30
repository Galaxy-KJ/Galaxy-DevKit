/**
 * @fileoverview Server-side Supabase client singleton for the REST API package.
 * @description Uses the service-role key (bypasses RLS). Auth is enforced
 *              by Express middleware before any handler hits this client.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

export function __resetSupabaseClientForTests(): void {
  cached = null;
}
