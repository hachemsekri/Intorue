#!/usr/bin/env node
/**
 * `corepack pnpm dev`: starts the local database (unless DATABASE_URL points elsewhere),
 * waits until it accepts connections, then starts the API, the web app and the shared
 * package watchers. Ctrl+C stops everything; the database closes last and cleanly.
 *
 * `corepack pnpm preview` (--prod): same, but runs the built, optimised API and web app
 * (no file watching, no on-demand page compilation). Much faster pages; restart to see code changes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

const url = process.env.DATABASE_URL ?? '';
const localDb = /^postgres(ql)?:\/\/[^@]*@?127\.0\.0\.1:5433\//.test(url) || /@127\.0\.0\.1:5433\//.test(url);
const children = [];

function run(args, name) {
  const child = spawn('corepack', ['pnpm', ...args], { cwd: root, stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    if (!stopping) {
      console.log(`[dev] ${name} stopped (code ${code}).`);
      stop();
    }
  });
  children.push(child);
  return child;
}

function waitForPort(port, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((ok, fail) => {
    const attempt = () => {
      const s = connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.end();
        ok();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) fail(new Error(`database not reachable on port ${port}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  // Apps first, database last so it can flush and close.
  for (const c of [...children].reverse()) c.kill('SIGINT');
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (localDb) {
  run(['--filter', '@winou/api', 'run', 'db:server'], 'database');
  await waitForPort(5433);
}
if (process.argv.includes('--prod')) {
  run(['--filter', '@winou/api', '--filter', '@winou/web', '--parallel', 'run', 'start'], 'apps');
} else {
  run(['-r', '--parallel', '--filter', '!@winou/simulator', 'run', 'dev'], 'apps');
}
