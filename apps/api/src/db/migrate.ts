import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { Database } from './client';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/** Applies src/migrations/*.sql in name order, once each, atomically per file. */
export async function migrate(db: Database, log: (m: string) => void = () => {}): Promise<string[]> {
  await db.system.execute(
    sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  const res = (await db.system.execute(sql`select name from schema_migrations`)) as unknown as {
    rows: { name: string }[];
  };
  const done = new Set(res.rows.map((r) => r.name));
  const applied: string[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    if (!/^[\w.-]+$/.test(file)) throw new Error(`Bad migration file name: ${file}`);
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await db.execScript(`${body}\n;insert into schema_migrations(name) values ('${file}');`);
    log(`applied ${file}`);
    applied.push(file);
  }
  return applied;
}
