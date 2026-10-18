const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync, rmSync } = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
for (const [folder, module, type] of [['cjs', 'commonjs', 'commonjs'], ['esm', 'ES2020', 'module']]) {
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(root, 'tsconfig.json'), '--module', module, '--outDir', path.join(dist, folder)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
  mkdirSync(path.join(dist, folder), { recursive: true });
  writeFileSync(path.join(dist, folder, 'package.json'), JSON.stringify({ type }) + '\n');
}
