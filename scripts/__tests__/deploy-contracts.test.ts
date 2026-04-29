/**
 * Smoke tests for scripts/deploy-contracts.sh and scripts/init-contracts.sh.
 *
 * These verify:
 *   1. Both scripts pass `bash -n` syntax checks.
 *   2. The deploy script registers all four contract entries in the manifest
 *      when `stellar` is stubbed and SKIP_BUILD=1.
 *   3. The init script reads the wasm hash for smart_wallet_factory init from
 *      the manifest correctly.
 */

import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const DEPLOY_SCRIPT = join(REPO_ROOT, 'scripts', 'deploy-contracts.sh');
const INIT_SCRIPT = join(REPO_ROOT, 'scripts', 'init-contracts.sh');

describe('deploy-contracts.sh / init-contracts.sh', () => {
  it('passes bash syntax check', () => {
    expect(() => execSync(`bash -n "${DEPLOY_SCRIPT}"`)).not.toThrow();
    expect(() => execSync(`bash -n "${INIT_SCRIPT}"`)).not.toThrow();
  });

  it('writes a complete manifest when stellar CLI is stubbed', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'galaxy-deploy-'));
    try {
      const stubBin = join(sandbox, 'bin');
      mkdirSync(stubBin, { recursive: true });

      // A trivial stellar stub: prints a deterministic hash/id then exits 0.
      // The script captures stdout into WASM_HASH and CONTRACT_ID, so we just
      // need the *last* line of output to be the value.
      const stub = `#!/usr/bin/env bash
case "$1" in
  contract)
    case "$2" in
      install) echo "wasm_hash_$$_$RANDOM" ;;
      deploy)  echo "C_$$_$RANDOM" ;;
      build)   exit 0 ;;
      invoke)  echo "invoked"; exit 0 ;;
      *)       echo "unknown stellar subcommand: $2" >&2; exit 2 ;;
    esac
    ;;
  *) echo "stub stellar: $*" ;;
esac
`;
      const stubPath = join(stubBin, 'stellar');
      writeFileSync(stubPath, stub, { mode: 0o755 });

      const manifest = join(sandbox, 'manifest.json');

      // Pre-create the WASM artifacts so deploy-contracts.sh's existence
      // check passes without needing a real cargo build.
      const wasms = [
        'packages/contracts/smart-wallet-account/target/wasm32v1-none/release/smart_wallet_account_factory.wasm',
        'packages/contracts/smart-wallet-account/target/wasm32v1-none/release/smart_wallet_account_wallet.wasm',
        'packages/contracts/smart-swap/target/wasm32v1-none/release/smart_swap.wasm',
        'packages/contracts/security-limits/target/wasm32v1-none/release/security_limits.wasm',
      ];
      for (const rel of wasms) {
        const full = join(REPO_ROOT, rel);
        mkdirSync(join(full, '..'), { recursive: true });
        writeFileSync(full, '');
      }

      const result = spawnSync('bash', [DEPLOY_SCRIPT], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PATH: `${stubBin}:${process.env['PATH'] ?? ''}`,
          SKIP_BUILD: '1',
          STELLAR_NETWORK: 'testnet',
          DEPLOYER_IDENTITY: 'test-deployer',
          DEPLOY_OUTPUT_FILE: manifest,
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);

      const data = JSON.parse(readFileSync(manifest, 'utf8'));
      expect(data.network).toBe('testnet');
      expect(data.deployer).toBe('test-deployer');
      expect(Object.keys(data.contracts).sort()).toEqual([
        'security_limits',
        'smart_swap',
        'smart_wallet_factory',
        'smart_wallet_wallet',
      ]);
      for (const c of Object.values<{ contractId: string; wasmHash: string }>(data.contracts)) {
        expect(c.contractId).toMatch(/^C_/);
        expect(c.wasmHash).toMatch(/^wasm_hash_/);
      }

      // Re-running should be a no-op (idempotent).
      const second = spawnSync('bash', [DEPLOY_SCRIPT], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PATH: `${stubBin}:${process.env['PATH'] ?? ''}`,
          SKIP_BUILD: '1',
          DEPLOY_OUTPUT_FILE: manifest,
        },
        encoding: 'utf8',
      });
      expect(second.status).toBe(0);
      expect(second.stdout).toMatch(/Skipping smart_wallet_factory/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it('init-contracts.sh reads wallet wasm hash from manifest', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'galaxy-init-'));
    try {
      const stubBin = join(sandbox, 'bin');
      mkdirSync(stubBin, { recursive: true });
      const stub = `#!/usr/bin/env bash
# Capture invoke args to a side-channel file so the test can assert on them.
if [[ "$1" == "contract" && "$2" == "invoke" ]]; then
  echo "$@" >> "$STUB_INVOKE_LOG"
fi
echo "ok"
`;
      writeFileSync(join(stubBin, 'stellar'), stub, { mode: 0o755 });

      const manifest = join(sandbox, 'manifest.json');
      writeFileSync(
        manifest,
        JSON.stringify(
          {
            network: 'testnet',
            deployer: 'test',
            contracts: {
              smart_wallet_factory: { contractId: 'CFACTORY', wasmHash: 'fhash' },
              smart_wallet_wallet: { contractId: 'CWALLET', wasmHash: 'whash' },
              smart_swap: { contractId: 'CSWAP', wasmHash: 'shash' },
              security_limits: { contractId: 'CLIMITS', wasmHash: 'lhash' },
            },
          },
          null,
          2,
        ),
      );

      const log = join(sandbox, 'invoke.log');
      const result = spawnSync('bash', [INIT_SCRIPT], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PATH: `${stubBin}:${process.env['PATH'] ?? ''}`,
          DEPLOY_OUTPUT_FILE: manifest,
          STUB_INVOKE_LOG: log,
        },
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      const invocations = readFileSync(log, 'utf8');
      // factory init must receive the wallet wasm hash from the manifest.
      expect(invocations).toMatch(/--id CFACTORY/);
      expect(invocations).toMatch(/--wallet_wasm_hash whash/);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
