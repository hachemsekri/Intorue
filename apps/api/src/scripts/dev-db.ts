/**
 * Local development database without Docker: PGlite (PostgreSQL + PostGIS compiled to
 * WebAssembly) running as its own long-lived process and speaking the normal PostgreSQL
 * protocol on 127.0.0.1:5433.
 *
 * Why a separate process: the API restarts on every code change; if it opened the data
 * folder itself, an abrupt restart could leave the folder unreadable. This process stays
 * up and shuts down cleanly on Ctrl+C.
 *
 * Development only. PGlite runs one query at a time, so the API uses a single connection
 * in this mode (DATABASE_POOL_MAX=1).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

async function main() {
  // Kept at the repository root, outside apps/api, so the API's file watcher never scans it.
  const dir = resolve(process.env.PGLITE_DIR ?? resolve(__dirname, '../../../../.data/pglite'));
  const port = Number(process.env.PGLITE_PORT ?? 5433);
  mkdirSync(dir, { recursive: true });

  const db = await PGlite.create(dir, { extensions: { postgis } });
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 1 });
  await server.start();
  console.log(`[db] PGlite (dev only) listening on postgres://127.0.0.1:${port}/postgres · data in ${dir}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[db] ${signal}: closing cleanly…`);
    await server.stop().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGBREAK', () => void shutdown('SIGBREAK')); // Windows Ctrl+Break / console close
}

main().catch((e) => {
  console.error('[db] Could not start:', e instanceof Error ? e.message : e);
  console.error('[db] If the data folder is damaged, delete .data/pglite and run "corepack pnpm db:seed" again (demo data only).');
  process.exit(1);
});
