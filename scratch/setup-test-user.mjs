// Creates a confirmed Supabase auth user, mirrors it into public.users,
// and prints an access token to use as Bearer for the REST API.
//
//   node scratch/setup-test-user.mjs

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = process.env.SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const EMAIL = process.env.TEST_EMAIL ?? 'monitor-tester@galaxy.local';
const PASSWORD = process.env.TEST_PASSWORD ?? 'GalaxyMonitor!2026';

async function ensureUser() {
  // Try to create. If it exists, fall back to fetching by email.
  const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  });

  if (create.ok) {
    const body = await create.json();
    return body.id;
  }

  if (create.status === 422 || create.status === 409 || create.status === 400) {
    const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    const body = await list.json();
    const user = body.users?.find((u) => u.email === EMAIL);
    if (!user) throw new Error(`could not locate existing user ${EMAIL}: ${JSON.stringify(body)}`);
    return user.id;
  }

  const txt = await create.text();
  throw new Error(`admin user create failed: ${create.status} ${txt}`);
}

async function mirrorIntoPublicUsers(userId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: userId, email: EMAIL, profile_data: { permissions: ['user'] } }),
  });
  if (!r.ok) throw new Error(`public.users upsert failed: ${r.status} ${await r.text()}`);
}

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`sign-in failed: ${r.status} ${await r.text()}`);
  return r.json();
}

const userId = await ensureUser();
await mirrorIntoPublicUsers(userId);
const session = await signIn();

console.log('export TEST_USER_ID=' + userId);
console.log('export TEST_EMAIL=' + EMAIL);
console.log('export TEST_ACCESS_TOKEN=' + session.access_token);
