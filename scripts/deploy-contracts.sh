#!/usr/bin/env bash
#
# deploy-contracts.sh — build, install and deploy all Soroban contracts to a
# Stellar network (defaults to testnet). Designed to be runnable from a
# developer machine and from CI.
#
# Usage:
#   ./scripts/deploy-contracts.sh                        # uses defaults
#   STELLAR_NETWORK=testnet DEPLOYER_IDENTITY=alice \
#     ./scripts/deploy-contracts.sh
#
# Environment variables (read from .env / .env.local if present):
#   STELLAR_NETWORK         testnet | mainnet | futurenet (default: testnet)
#   DEPLOYER_IDENTITY       Stellar CLI identity to source from (default: deployer)
#   STELLAR_RPC_URL         Optional RPC URL override
#   DEPLOY_OUTPUT_FILE      Path to write the JSON manifest (default: scripts/.deploy-output.json)
#   SKIP_BUILD              Set to "1" to skip the build step (useful in CI when wasm is cached)
#
# The script is idempotent on retries: it captures stdout from each
# `stellar contract` invocation, so re-running after a transient RPC error
# only re-deploys contracts whose ID is missing from the manifest.

set -Eeuo pipefail

# ── Colours (only when stdout is a TTY) ──────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_RED=$'\033[31m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_CYAN=$'\033[36m'
else
  C_RESET= C_BOLD= C_RED= C_GREEN= C_YELLOW= C_CYAN=
fi

log()   { printf '%s[deploy]%s %s\n'   "$C_CYAN"   "$C_RESET" "$*"; }
warn()  { printf '%s[deploy]%s %s\n'   "$C_YELLOW" "$C_RESET" "$*" >&2; }
error() { printf '%s[deploy]%s %s\n'   "$C_RED"    "$C_RESET" "$*" >&2; }
ok()    { printf '%s[deploy]%s %s\n'   "$C_GREEN"  "$C_RESET" "$*"; }

# ── Resolve repo root ────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ── Load .env / .env.local if present (without overriding already-set vars) ──
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  log "Loading env from $file"
  # shellcheck disable=SC2046
  set -a
  # Filter comments + blank lines so `set -a` only sees real assignments.
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$file" || true)
  set +a
}
load_env_file ".env.local"
load_env_file ".env"

# ── Defaults ─────────────────────────────────────────────────────────────────
STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-deployer}"
DEPLOY_OUTPUT_FILE="${DEPLOY_OUTPUT_FILE:-$REPO_ROOT/scripts/.deploy-output.json}"
SKIP_BUILD="${SKIP_BUILD:-0}"

CONTRACTS_DIR="$REPO_ROOT/packages/contracts"

# Each row: <key>:<contract-dir>:<wasm-relative-path>
# The smart-wallet-account workspace produces two WASMs (factory + wallet),
# the others are single-package crates that build straight to <crate>.wasm.
CONTRACTS=(
  "smart_wallet_factory:smart-wallet-account:target/wasm32v1-none/release/smart_wallet_account_factory.wasm"
  "smart_wallet_wallet:smart-wallet-account:target/wasm32v1-none/release/smart_wallet_account_wallet.wasm"
  "smart_swap:smart-swap:target/wasm32v1-none/release/smart_swap.wasm"
  "security_limits:security-limits:target/wasm32v1-none/release/security_limits.wasm"
)

# ── Pre-flight checks ────────────────────────────────────────────────────────
require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    error "Required command not found: $1"
    exit 127
  }
}
require_cmd stellar

# ── Build (one shot for the whole workspace) ─────────────────────────────────
build_all() {
  if [[ "$SKIP_BUILD" == "1" ]]; then
    warn "SKIP_BUILD=1 — assuming WASM artifacts already exist"
    return 0
  fi

  log "Building all contracts under $CONTRACTS_DIR"
  for entry in "${CONTRACTS[@]}"; do
    IFS=':' read -r _ dir _ <<<"$entry"
    local target="$CONTRACTS_DIR/$dir"
    [[ -d "$target" ]] || { error "Missing contract dir: $target"; exit 1; }

    log "  → stellar contract build ($dir)"
    ( cd "$target" && stellar contract build )
  done
  ok "Build complete"
}

# ── Manifest helpers ─────────────────────────────────────────────────────────
manifest_init() {
  if [[ ! -f "$DEPLOY_OUTPUT_FILE" ]]; then
    log "Initialising manifest: $DEPLOY_OUTPUT_FILE"
    cat >"$DEPLOY_OUTPUT_FILE" <<EOF
{
  "network": "$STELLAR_NETWORK",
  "deployer": "$DEPLOYER_IDENTITY",
  "contracts": {}
}
EOF
  fi
}

manifest_get() {
  local key="$1"
  python3 - "$DEPLOY_OUTPUT_FILE" "$key" <<'PY' 2>/dev/null || true
import json, sys
path, key = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        data = json.load(f)
    val = data.get("contracts", {}).get(key, {}).get("contractId")
    if val:
        print(val)
except Exception:
    pass
PY
}

manifest_set() {
  local key="$1" contract_id="$2" wasm_hash="${3:-}"
  python3 - "$DEPLOY_OUTPUT_FILE" "$key" "$contract_id" "$wasm_hash" <<'PY'
import json, sys
path, key, cid, wasm = sys.argv[1:]
with open(path) as f:
    data = json.load(f)
data.setdefault("contracts", {})[key] = {
    "contractId": cid,
    "wasmHash": wasm or None,
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

# ── Deploy a single contract ─────────────────────────────────────────────────
deploy_one() {
  local key="$1" dir="$2" wasm_rel="$3"
  local wasm_path="$CONTRACTS_DIR/$dir/$wasm_rel"

  if [[ ! -f "$wasm_path" ]]; then
    error "WASM not found for $key: $wasm_path"
    exit 1
  fi

  local existing
  existing="$(manifest_get "$key" || true)"
  if [[ -n "$existing" ]]; then
    ok "Skipping $key — already deployed at $existing (delete entry from $DEPLOY_OUTPUT_FILE to redeploy)"
    return 0
  fi

  log "Installing WASM for $key"
  local wasm_hash
  wasm_hash=$(stellar contract install \
    --wasm "$wasm_path" \
    --source "$DEPLOYER_IDENTITY" \
    --network "$STELLAR_NETWORK" \
    --ignore-checks)
  log "  wasm hash: $wasm_hash"

  log "Deploying $key"
  local contract_id
  contract_id=$(stellar contract deploy \
    --wasm-hash "$wasm_hash" \
    --source "$DEPLOYER_IDENTITY" \
    --network "$STELLAR_NETWORK" \
    --ignore-checks)
  ok "  $key → $contract_id"

  manifest_set "$key" "$contract_id" "$wasm_hash"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
  log "Network:    $STELLAR_NETWORK"
  log "Deployer:   $DEPLOYER_IDENTITY"
  log "Manifest:   $DEPLOY_OUTPUT_FILE"

  build_all
  manifest_init

  for entry in "${CONTRACTS[@]}"; do
    IFS=':' read -r key dir wasm <<<"$entry"
    deploy_one "$key" "$dir" "$wasm"
  done

  ok "All contracts deployed. Manifest written to $DEPLOY_OUTPUT_FILE"
  printf '%s\n' "$(cat "$DEPLOY_OUTPUT_FILE")"
}

main "$@"
