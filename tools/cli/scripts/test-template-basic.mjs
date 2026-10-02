#!/usr/bin/env node
/**
 * CI smoke test for issue #447: scaffolds the `basic` template into a fresh
 * temp directory with `galaxy create`, installs its real dependencies from
 * the npm registry (not a workspace symlink), and runs `tsc --noEmit` on the
 * result.
 *
 * This is a real, standalone consumer run - the scaffolded project lives
 * outside this monorepo's workspace and resolves every dependency from the
 * registry exactly as an end user's `npm install` would. That distinction
 * matters: a type-check against the monorepo's own source (e.g. via a
 * tsconfig `paths` alias) would not have caught the bug this test guards
 * against - a template whose generated code or package.json depended on a
 * package that either doesn't exist on npm, or does exist but resolves (for
 * a real external installer) to an unsafe, server-only entry point.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliDir = fileURLToPath(new URL('..', import.meta.url));
const projectName = 'smoke-test-basic';
const workDir = mkdtempSync(join(tmpdir(), 'galaxy-template-smoke-'));
const projectDir = join(workDir, projectName);

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}  (cwd: ${cwd})`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

try {
  // Scaffold + real `npm install` (no --skip-install), exactly as a user
  // running `galaxy create <name> --template basic` would experience it.
  run(
    'npx',
    ['tsx', 'src/index.ts', 'create', projectName, '--template', 'basic', '--directory', projectDir],
    cliDir
  );
  run('npx', ['tsc', '--noEmit'], projectDir);
  console.log('\n✅ basic template scaffolds, installs, and type-checks cleanly as a standalone project.');
} finally {
  rmSync(workDir, { recursive: true, force: true });
}