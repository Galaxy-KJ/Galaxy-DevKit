#!/usr/bin/env bash
# Galaxy DevKit — Monitoring smoke test driver.
#
# Boots the webhook receiver, the REST API and a fake-protocol worker, creates
# a monitoring alert via curl, waits for the worker to trigger it, and verifies
# the webhook arrived. Cleans up on exit (Ctrl+C or natural end).
#
# Prereqs: Supabase local must already be up (`supabase start`). If it isn't,
# the script tries to start it for you.
#
# Usage:
#   ./scratch/smoke.sh                # full happy path
#   FAKE_HEALTH_FACTOR=2.0 ./scratch/smoke.sh   # above threshold → no trigger
#   KEEP_RUNNING=1 ./scratch/smoke.sh # leave processes up after the assertions
#
# Exit codes: 0 = pass, non-zero = fail.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$REPO_ROOT/packages/api/rest"
LOG_DIR="${LOG_DIR:-/tmp}"
RECEIVER_LOG="$LOG_DIR/galaxy-receiver.log"
API_LOG="$LOG_DIR/galaxy-api.log"
WORKER_LOG="$LOG_DIR/galaxy-worker.log"

WEBHOOK_SECRET="${WEBHOOK_SECRET:-monitor-secret-very-long}"
RECEIVER_PORT="${RECEIVER_PORT:-4000}"
API_PORT="${API_PORT:-3000}"
FAKE_HEALTH_FACTOR="${FAKE_HEALTH_FACTOR:-0.9}"
EVAL_INTERVAL_MS="${EVAL_INTERVAL_MS:-3000}"
THRESHOLD="${THRESHOLD:-1.5}"

SUPABASE_URL_LOCAL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SUPABASE_SERVICE_ROLE_KEY_LOCAL="${SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"
SUPABASE_ANON_KEY_LOCAL="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
JWT_SECRET_LOCAL="${JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"

RECEIVER_PID=""
API_PID=""
WORKER_PID=""

# ─────────────────────────────────────────────────────────────────────────────
# Pretty printing
# ─────────────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_GREEN=$'\033[0;32m'; C_RED=$'\033[0;31m'; C_YELLOW=$'\033[0;33m'
  C_BLUE=$'\033[0;34m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
else
  C_GREEN=""; C_RED=""; C_YELLOW=""; C_BLUE=""; C_DIM=""; C_RESET=""; C_BOLD=""
fi

step()  { printf "\n%s▶ %s%s\n" "$C_BLUE$C_BOLD" "$*" "$C_RESET"; }
ok()    { printf "  %s✓%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf "  %s⚠%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
fail()  { printf "  %s✗%s %s\n" "$C_RED" "$C_RESET" "$*"; }
hint()  { printf "    %s%s%s\n" "$C_DIM" "$*" "$C_RESET"; }

# ─────────────────────────────────────────────────────────────────────────────
# Cleanup (trap)
# ─────────────────────────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [[ "${KEEP_RUNNING:-0}" == "1" ]]; then
    step "KEEP_RUNNING=1 — leaving processes alive"
    [[ -n "$RECEIVER_PID" ]] && hint "receiver pid=$RECEIVER_PID  log=$RECEIVER_LOG"
    [[ -n "$API_PID"      ]] && hint "api      pid=$API_PID       log=$API_LOG"
    [[ -n "$WORKER_PID"   ]] && hint "worker   pid=$WORKER_PID    log=$WORKER_LOG"
    hint "stop them with: kill $RECEIVER_PID $API_PID $WORKER_PID"
    exit "$exit_code"
  fi
  step "Cleaning up"
  for pid in "$WORKER_PID" "$API_PID" "$RECEIVER_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 1
  ok "done"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
wait_for_port() {
  local port="$1" label="$2" timeout="${3:-30}"
  for ((i=0; i<timeout; i++)); do
    if (echo >"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
      ok "$label listening on :$port"
      return 0
    fi
    sleep 1
  done
  fail "$label never came up on :$port"
  return 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { fail "missing required command: $1"; return 1; }
}

# ─────────────────────────────────────────────────────────────────────────────
# 0. Prereqs
# ─────────────────────────────────────────────────────────────────────────────
step "Checking prerequisites"
require_cmd node || exit 1
require_cmd npx  || exit 1
require_cmd curl || exit 1
require_cmd docker || exit 1
ok "node, npx, curl, docker available"

# Supabase up?
if ! curl -sf "${SUPABASE_URL_LOCAL%/}/auth/v1/health" >/dev/null 2>&1; then
  warn "Supabase doesn't seem to be running — trying \`supabase start\`"
  if ! require_cmd supabase; then exit 1; fi
  ( cd "$REPO_ROOT" && supabase start ) || { fail "supabase start failed"; exit 1; }
fi
ok "Supabase reachable at $SUPABASE_URL_LOCAL"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Webhook receiver
# ─────────────────────────────────────────────────────────────────────────────
step "Starting webhook receiver on :$RECEIVER_PORT"
SECRET="$WEBHOOK_SECRET" PORT="$RECEIVER_PORT" \
  node "$REPO_ROOT/scratch/webhook-receiver.mjs" >"$RECEIVER_LOG" 2>&1 &
RECEIVER_PID=$!
hint "pid=$RECEIVER_PID  log=$RECEIVER_LOG"
wait_for_port "$RECEIVER_PORT" "receiver" 15 || exit 1

# ─────────────────────────────────────────────────────────────────────────────
# 2. REST API
# ─────────────────────────────────────────────────────────────────────────────
step "Starting REST API on :$API_PORT"
(
  cd "$API_DIR" && \
  SUPABASE_URL="$SUPABASE_URL_LOCAL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_LOCAL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY_LOCAL" \
  JWT_SECRET="$JWT_SECRET_LOCAL" \
  PORT="$API_PORT" \
    npx tsx src/index.ts
) >"$API_LOG" 2>&1 &
API_PID=$!
hint "pid=$API_PID  log=$API_LOG"
wait_for_port "$API_PORT" "api" 30 || { tail -20 "$API_LOG"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 3. Worker (with fake protocol pool)
# ─────────────────────────────────────────────────────────────────────────────
step "Starting worker (fake HF=$FAKE_HEALTH_FACTOR, eval=${EVAL_INTERVAL_MS}ms)"
(
  cd "$API_DIR" && \
  SUPABASE_URL="$SUPABASE_URL_LOCAL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_LOCAL" \
  FAKE_HEALTH_FACTOR="$FAKE_HEALTH_FACTOR" \
  MONITOR_EVAL_INTERVAL_MS="$EVAL_INTERVAL_MS" \
    npx tsx "$REPO_ROOT/scratch/run-worker-with-fake-protocol.ts"
) >"$WORKER_LOG" 2>&1 &
WORKER_PID=$!
hint "pid=$WORKER_PID  log=$WORKER_LOG"
sleep 2
if ! kill -0 "$WORKER_PID" 2>/dev/null; then
  fail "worker died during boot"
  tail -20 "$WORKER_LOG"
  exit 1
fi
ok "worker process alive"

# ─────────────────────────────────────────────────────────────────────────────
# 4. Provision test user + JWT
# ─────────────────────────────────────────────────────────────────────────────
step "Provisioning test user + JWT"
USER_OUTPUT=$(
  SUPABASE_URL="$SUPABASE_URL_LOCAL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_LOCAL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY_LOCAL" \
    node "$REPO_ROOT/scratch/setup-test-user.mjs"
)
TEST_USER_ID=$(echo "$USER_OUTPUT" | sed -n 's/^export TEST_USER_ID=//p')
TEST_ACCESS_TOKEN=$(echo "$USER_OUTPUT" | sed -n 's/^export TEST_ACCESS_TOKEN=//p')
[[ -n "$TEST_ACCESS_TOKEN" ]] || { fail "no access token returned"; exit 1; }
ok "user_id=$TEST_USER_ID  token_len=${#TEST_ACCESS_TOKEN}"

# ─────────────────────────────────────────────────────────────────────────────
# 5. POST /monitoring/alerts
# ─────────────────────────────────────────────────────────────────────────────
step "POST /api/v1/monitoring/alerts (threshold=$THRESHOLD)"
ALERT_BODY=$(cat <<JSON
{
  "name":"smoke.sh: Blend HF guard",
  "protocol":"blend",
  "accountAddress":"GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "alertType":"health_factor_below",
  "threshold":$THRESHOLD,
  "channel":"webhook",
  "channelConfig":{"url":"http://127.0.0.1:$RECEIVER_PORT","secret":"$WEBHOOK_SECRET"}
}
JSON
)

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "http://127.0.0.1:$API_PORT/api/v1/monitoring/alerts" \
  -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$ALERT_BODY")
CREATE_HTTP=$(echo "$CREATE_RESPONSE" | tail -1)
CREATE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

if [[ "$CREATE_HTTP" != "201" ]]; then
  fail "expected 201, got $CREATE_HTTP"
  echo "$CREATE_BODY"
  exit 1
fi
ALERT_ID=$(echo "$CREATE_BODY" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).alert.id))')
ok "alert created  id=$ALERT_ID"

# ─────────────────────────────────────────────────────────────────────────────
# 6. Wait for the worker to tick at least once + dispatch
# ─────────────────────────────────────────────────────────────────────────────
step "Waiting for worker tick + webhook delivery"
EXPECT_TRIGGER=1
# A HF above threshold (or Infinity) should NOT trigger.
if awk -v hf="$FAKE_HEALTH_FACTOR" -v th="$THRESHOLD" 'BEGIN{ if (hf == "∞" || hf+0 >= th+0) exit 0; exit 1 }' 2>/dev/null; then
  EXPECT_TRIGGER=0
  hint "FAKE_HEALTH_FACTOR=$FAKE_HEALTH_FACTOR ≥ threshold=$THRESHOLD → expecting NO trigger"
fi

WAIT_BUDGET_S=$(( (EVAL_INTERVAL_MS / 1000) + 6 ))
hint "budget=${WAIT_BUDGET_S}s"
sleep "$WAIT_BUDGET_S"

# ─────────────────────────────────────────────────────────────────────────────
# 7. Assertions
# ─────────────────────────────────────────────────────────────────────────────
step "Verifying webhook receiver log"
if grep -q "alertId\": \"$ALERT_ID\"" "$RECEIVER_LOG"; then
  if [[ "$EXPECT_TRIGGER" -eq 1 ]]; then
    ok "webhook received with correct alertId"
  else
    fail "webhook fired but threshold should have prevented it"
    exit 1
  fi
elif [[ "$EXPECT_TRIGGER" -eq 0 ]]; then
  ok "no webhook fired (expected)"
else
  fail "no webhook received for alert $ALERT_ID"
  echo "--- receiver log ---"; tail -30 "$RECEIVER_LOG"
  echo "--- worker log ---";   tail -30 "$WORKER_LOG"
  exit 1
fi

if [[ "$EXPECT_TRIGGER" -eq 1 ]]; then
  step "Verifying HMAC signature was valid"
  if grep -q "signature: valid" "$RECEIVER_LOG"; then
    ok "signature: valid"
  else
    fail "signature missing or invalid in receiver log"
    tail -20 "$RECEIVER_LOG"; exit 1
  fi

  step "Verifying alert_events row was persisted"
  EVENT_ROW=$(docker exec supabase_db_galaxy-devkit psql -U postgres -d postgres -tA -c \
    "SELECT delivery_status || '|' || delivery_attempts FROM alert_events WHERE alert_id = '$ALERT_ID' ORDER BY triggered_at DESC LIMIT 1;")
  if [[ -z "$EVENT_ROW" ]]; then
    fail "no alert_events row found"; exit 1
  fi
  EVENT_STATUS="${EVENT_ROW%|*}"; EVENT_ATTEMPTS="${EVENT_ROW#*|}"
  if [[ "$EVENT_STATUS" == "delivered" ]]; then
    ok "alert_events.delivery_status=delivered  attempts=$EVENT_ATTEMPTS"
  else
    fail "delivery_status=$EVENT_STATUS (expected 'delivered')"
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 8. Bonus: list alerts, fetch one, list events
# ─────────────────────────────────────────────────────────────────────────────
step "GET /monitoring/alerts (list)"
LIST_COUNT=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/monitoring/alerts" \
  -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log((JSON.parse(d).alerts||[]).length))')
ok "alerts visible to user: $LIST_COUNT"

step "GET /monitoring/alerts/$ALERT_ID/events"
EVENTS_COUNT=$(curl -s "http://127.0.0.1:$API_PORT/api/v1/monitoring/alerts/$ALERT_ID/events" \
  -H "Authorization: Bearer $TEST_ACCESS_TOKEN" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log((JSON.parse(d).events||[]).length))')
ok "events for this alert: $EVENTS_COUNT"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────
printf "\n%s%s✓ SMOKE TEST PASSED%s\n" "$C_GREEN" "$C_BOLD" "$C_RESET"
hint "logs: $RECEIVER_LOG | $API_LOG | $WORKER_LOG"
hint "alert id: $ALERT_ID  (user $TEST_USER_ID)"
hint "tip: run again with KEEP_RUNNING=1 to leave the stack up"
