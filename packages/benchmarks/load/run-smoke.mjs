#!/usr/bin/env node
/**
 * Start a local target if BASE_URL is unset, run k6 smoke, then stop the fixture.
 */
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3456);
const baseUrl = process.env.BASE_URL || `http://127.0.0.1:${port}`;

if (/mainnet/i.test(baseUrl)) {
  console.error('refusing to load-test a mainnet URL');
  process.exit(1);
}

function portOpen() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: '127.0.0.1', port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

let fixture = null;

try {
  const alreadyUp = process.env.BASE_URL ? await portOpen() : false;
  if (!alreadyUp && !process.env.BASE_URL) {
    fixture = spawn(process.execPath, [path.join(dir, 'fixture-server.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, PORT: String(port) },
    });
    for (let i = 0; i < 25; i += 1) {
      if (await portOpen()) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!(await portOpen())) {
      throw new Error('fixture server did not start');
    }
  }

  await run('k6', ['run', path.join(dir, 'smoke.js')], { BASE_URL: baseUrl });
} catch (err) {
  console.error(err.message || err);
  process.exitCode = 1;
} finally {
  if (fixture) fixture.kill('SIGTERM');
}
