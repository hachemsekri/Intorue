import { sql } from 'drizzle-orm';
import { loadEnv } from '../config/env';
import { createDatabase } from '../db/client';

/** Opens the database and prints row counts. Useful to check a local PGlite folder is healthy. */
async function main() {
  const env = loadEnv();
  const db = await createDatabase(env.DATABASE_URL, { poolMax: env.DATABASE_POOL_MAX });
  for (const t of ['users', 'organizations', 'vehicles', 'devices', 'positions']) {
    const r = (await db.system.execute(sql.raw(`select count(*)::int as n from ${t}`))) as unknown as { rows: { n: number }[] };
    console.log(`${t}: ${r.rows[0]?.n}`);
  }
  await db.close();
}
main().catch((e) => {
  console.error('Database check failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
