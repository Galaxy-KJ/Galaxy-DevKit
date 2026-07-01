/**
 * @fileoverview Seed script for testing the Team Accounts endpoints (Issue #313).
 * @description Creates two confirmed users in Supabase Auth + public.users and
 *              prints ready-to-copy JWTs so you can curl the /teams routes.
 *              Idempotent: safe to re-run — existing users are re-used.
 *
 * Usage:
 *   cd packages/api/rest
 *   npx ts-node scripts/seed-teams-test-users.ts
 *
 * Required env (from .env.local or shell):
 *   SUPABASE_URL              e.g. http://127.0.0.1:54321
 *   SUPABASE_SERVICE_ROLE_KEY (from `supabase start` output)
 *   SUPABASE_ANON_KEY         (from `supabase start` output — used for signIn)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load .env.local from the repo root, same as src/index.ts does at boot.
config({ path: resolve(__dirname, '../../../../.env.local') });

interface TestUserSpec {
  label: string;
  email: string;
  password: string;
}

const TEST_USERS: TestUserSpec[] = [
  { label: 'A', email: 'owner@galaxy.test',    password: 'password123!' },
  { label: 'B', email: 'invitee@galaxy.test',  password: 'password123!' },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\nMissing required env var: ${name}`);
    console.error(`Run \`supabase start\` and copy the value into .env.local\n`);
    process.exit(1);
  }
  return value;
}

async function upsertUser(
  adminClient: SupabaseClient,
  spec: TestUserSpec
): Promise<string> {
  // auth.admin.createUser is idempotent-hostile — it errors on duplicate email.
  // We handle that by falling back to a listUsers lookup on the specific error.
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
  });

  if (created?.user?.id) {
    return created.user.id;
  }

  const alreadyExists =
    createErr?.message?.toLowerCase().includes('already') ||
    createErr?.message?.toLowerCase().includes('duplicate');

  if (!alreadyExists) {
    throw new Error(
      `Failed to create ${spec.email}: ${createErr?.message ?? 'unknown error'}`
    );
  }

  // Look up the existing user id — listUsers is paginated but for local dev
  // we're never going to hit more than a handful of users.
  const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  const match = list.users.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());
  if (!match) {
    throw new Error(`User ${spec.email} exists in Supabase but was not returned by listUsers`);
  }
  return match.id;
}

async function upsertPublicUserRow(
  adminClient: SupabaseClient,
  userId: string,
  email: string
): Promise<void> {
  // public.users has FK -> auth.users(id) with id as the PK, so the same id is
  // used in both tables. Upsert avoids exploding on re-runs.
  const { error } = await adminClient
    .from('users')
    .upsert({ id: userId, email }, { onConflict: 'id' });
  if (error) {
    throw new Error(`Failed to upsert public.users row for ${email}: ${error.message}`);
  }
}

async function signInAndReturnJwt(
  supabaseUrl: string,
  anonKey: string,
  spec: TestUserSpec
): Promise<string> {
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: spec.email,
    password: spec.password,
  });
  if (error || !data.session) {
    throw new Error(`Sign-in failed for ${spec.email}: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

async function main(): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Seeding test users for the /teams endpoints...\n');

  const results: Array<TestUserSpec & { id: string; jwt: string }> = [];

  for (const spec of TEST_USERS) {
    process.stdout.write(`  [${spec.label}] ${spec.email} ... `);
    const id = await upsertUser(admin, spec);
    await upsertPublicUserRow(admin, id, spec.email);
    const jwt = await signInAndReturnJwt(supabaseUrl, anonKey, spec);
    results.push({ ...spec, id, jwt });
    console.log('OK');
  }

  console.log('\n----- Ready-to-use env vars -----\n');
  for (const r of results) {
    console.log(`# User ${r.label}: ${r.email} (id=${r.id})`);
    console.log(`export TOKEN_${r.label}='${r.jwt}'\n`);
  }

  console.log('----- Sample curl -----\n');
  console.log(`curl -X POST http://localhost:3000/api/v1/teams/organizations \\`);
  console.log(`  -H "Authorization: Bearer $TOKEN_A" \\`);
  console.log(`  -H 'Content-Type: application/json' \\`);
  console.log(`  -d '{"name":"Acme Corp"}'\n`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
