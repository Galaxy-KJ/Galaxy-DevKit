#!/usr/bin/env bash
#
# init-contracts.sh — invoke the post-deploy initialisation entrypoint on each
# Soroban contract that requires one. Reads contract IDs from the manifest
# produced by `deploy-contracts.sh`.
#
# Usage:
#   ./scripts/init-contracts.sh
#
# Environment variables:
#   STELLAR_NETWORK         testnet | mainnet | futurenet (default: testnet)
#   DEPLOYER_IDENTITY       Stellar CLI identity (default: deployer)
#   DEPLOY_OUTPUT_FILE      Path to deploy manifest (default: scripts/.deploy-output.json)
#
# smart-swap `initialize(admin, oracle, router, max_price_age_secs, target_tolerance_bps)`:
#   SMART_SWAP_ROUTER_ID              Soroswap-compatible router (required, else skipped)
#   SMART_SWAP_ORACLE_ID              Oracle with get_price_checked (default: price_oracle from manifest)
#   SMART_SWAP_ADMIN                  Admin address or identity (default: DEPLOYER_IDENTITY)
#   SMART_SWAP_MAX_PRICE_AGE_SECS     Reject oracle prices older than this (default: 300)
#   SMART_SWAP_TARGET_TOLERANCE_BPS   TargetPrice band in basis points (default: 50)

set -Eeuo pipefail

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_CYAN=$'\033[36m'
else
  C_RESET= C_RED= C_GREEN= C_YELLOW= C_CYAN=
fi
log()   { printf '%s[init]%s %s\n'  "$C_CYAN"   "$C_RESET" "$*"; }
warn()  { printf '%s[init]%s %s\n'  "$C_YELLOW" "$C_RESET" "$*" >&2; }
error() { printf '%s[init]%s %s\n'  "$C_RED"    "$C_RESET" "$*" >&2; }
ok()    { printf '%s[init]%s %s\n'  "$C_GREEN"  "$C_RESET" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  set -a
  source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$file" || true)
  set +a
}
load_env_file ".env.local"
load_env_file ".env"

STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
DEPLOYER_IDENTITY="${DEPLOYER_IDENTITY:-deployer}"
DEPLOY_OUTPUT_FILE="${DEPLOY_OUTPUT_FILE:-$REPO_ROOT/scripts/.deploy-output.json}"

[[ -f "$DEPLOY_OUTPUT_FILE" ]] || {
  error "Manifest not found: $DEPLOY_OUTPUT_FILE"
  error "Run scripts/deploy-contracts.sh first."
  exit 1
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || { error "Missing: $1"; exit 127; }; }
require_cmd stellar
require_cmd python3

read_field() {
  python3 - "$DEPLOY_OUTPUT_FILE" "$1" "$2" <<'PY' 2>/dev/null || true
import json, sys
path, key, field = sys.argv[1:]
try:
    with open(path) as f:
        data = json.load(f)
    print(data.get("contracts", {}).get(key, {}).get(field, "") or "")
except Exception:
    pass
PY
}

invoke_init() {
  local key="$1"; shift
  local contract_id
  contract_id="$(read_field "$key" "contractId")"
  if [[ -z "$contract_id" ]]; then
    warn "No contractId for $key in manifest — skipping"
    return 0
  fi

  log "Initialising $key ($contract_id) — args: $*"
  stellar contract invoke \
    --id "$contract_id" \
    --source "$DEPLOYER_IDENTITY" \
    --network "$STELLAR_NETWORK" \
    -- "$@"
  ok "  $key initialised"
}

main() {
  log "Network:  $STELLAR_NETWORK"
  log "Deployer: $DEPLOYER_IDENTITY"
  log "Manifest: $DEPLOY_OUTPUT_FILE"

  # Smart wallet factory needs the wallet WASM hash so it can spawn user wallets.
  local wallet_hash
  wallet_hash="$(read_field "smart_wallet_wallet" "wasmHash")"
  if [[ -n "$wallet_hash" ]]; then
    invoke_init "smart_wallet_factory" \
      init --wallet_wasm_hash "$wallet_hash"
  else
    warn "smart_wallet_wallet wasmHash not in manifest — skipping factory init"
  fi

  # The price oracle must be initialised right after deploy: whoever calls
  # initialize first becomes admin, so the deployer claims it here.
  if [[ -n "$(read_field "price_oracle" "contractId")" ]]; then
    local admin_addr
    admin_addr="$(stellar keys address "$DEPLOYER_IDENTITY")"
    invoke_init "price_oracle" \
      initialize --admin "$admin_addr"
  else
    warn "price_oracle not in manifest, skipping oracle init"
  fi

  # smart-swap reads prices from the oracle and swaps through a router. The
  # repo deploys no router, so its id must come from the environment.
  local swap_oracle="${SMART_SWAP_ORACLE_ID:-$(read_field "price_oracle" "contractId")}"
  if [[ -n "${SMART_SWAP_ROUTER_ID:-}" && -n "$swap_oracle" ]]; then
    invoke_init "smart_swap" \
      initialize \
      --admin "${SMART_SWAP_ADMIN:-$DEPLOYER_IDENTITY}" \
      --oracle "$swap_oracle" \
      --router "$SMART_SWAP_ROUTER_ID" \
      --max_price_age_secs "${SMART_SWAP_MAX_PRICE_AGE_SECS:-300}" \
      --target_tolerance_bps "${SMART_SWAP_TARGET_TOLERANCE_BPS:-50}"
  else
    warn "SMART_SWAP_ROUTER_ID or an oracle id is not set: skipping smart_swap init"
  fi

  # security-limits does not currently expose a public init entrypoint; it
  # self-initialises on first user call. If/when it grows one, add an
  # `invoke_init "<key>" init ...` line below. The manifest entry is already
  # populated by deploy-contracts.sh.

  ok "Initialisation complete."
}

main "$@"
